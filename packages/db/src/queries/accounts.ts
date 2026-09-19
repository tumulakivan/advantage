import { asc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../client";
import { accounts, type Account, type NewAccount } from "../schema";

export interface AccountWithBalance extends Account {
  balanceMinor: number;
  transactionCount: number;
}

/**
 * Balances are always derived, never stored: opening balance, plus everything
 * that landed in the account, minus everything that left it. A stored balance
 * is a second source of truth that drifts the first time an edit is missed.
 *
 * Table names are written out rather than interpolated from the schema on
 * purpose: Drizzle renders a column reference unqualified in a single-table
 * select, so inside a correlated subquery a bare "id" would bind to
 * `transactions.id` instead of `accounts.id` and silently return zero.
 */
const balanceExpression = sql<number>`
  "accounts"."opening_balance_minor"
  + COALESCE((
      SELECT SUM(
        CASE t.type
          WHEN 'income' THEN t.amount_minor
          ELSE -t.amount_minor
        END
      )
      FROM transactions t
      WHERE t.account_id = "accounts"."id"
    ), 0)
  + COALESCE((
      SELECT SUM(t.amount_minor)
      FROM transactions t
      WHERE t.to_account_id = "accounts"."id" AND t.type = 'transfer'
    ), 0)
`;

const countExpression = sql<number>`
  COALESCE((
    SELECT COUNT(*) FROM transactions t
    WHERE t.account_id = "accounts"."id" OR t.to_account_id = "accounts"."id"
  ), 0)
`;

export async function listAccounts(
  db: Database,
  options: { includeArchived?: boolean } = {},
): Promise<AccountWithBalance[]> {
  const rows = await db
    .select({
      id: accounts.id,
      slug: accounts.slug,
      name: accounts.name,
      type: accounts.type,
      icon: accounts.icon,
      color: accounts.color,
      openingBalanceMinor: accounts.openingBalanceMinor,
      currency: accounts.currency,
      excludeFromTotals: accounts.excludeFromTotals,
      sortOrder: accounts.sortOrder,
      archivedAt: accounts.archivedAt,
      createdAt: accounts.createdAt,
      balanceMinor: balanceExpression,
      transactionCount: countExpression,
    })
    .from(accounts)
    .where(options.includeArchived ? undefined : isNull(accounts.archivedAt))
    .orderBy(asc(accounts.sortOrder), asc(accounts.name));

  return rows.map((row) => ({
    ...row,
    balanceMinor: Number(row.balanceMinor ?? 0),
    transactionCount: Number(row.transactionCount ?? 0),
  }));
}

export async function createAccount(
  db: Database,
  input: Omit<NewAccount, "id" | "createdAt">,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(accounts).values({ ...input, id, createdAt: new Date().toISOString() });
  return id;
}

export async function updateAccount(
  db: Database,
  id: string,
  patch: Partial<Omit<NewAccount, "id" | "createdAt">>,
): Promise<void> {
  await db.update(accounts).set(patch).where(eq(accounts.id, id));
}

/** Soft delete: transactions keep their account label. */
export async function archiveAccount(db: Database, id: string): Promise<void> {
  await db
    .update(accounts)
    .set({ archivedAt: new Date().toISOString() })
    .where(eq(accounts.id, id));
}

export async function restoreAccount(db: Database, id: string): Promise<void> {
  await db.update(accounts).set({ archivedAt: null }).where(eq(accounts.id, id));
}
