import type {
  AccountInput,
  AccountPatch,
  AccountWithBalance,
  AddFromCatalogInput,
} from "@advantage/api-client/types";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/client";
import type { Tenant } from "../db/tenant";
import { ApiError } from "../errors";
import { logoIndex } from "./catalog";
import { toAccount } from "./mappers";

/**
 * Balances are always derived, never stored: opening balance, plus everything
 * that landed in the account, minus everything that left it. A stored balance
 * is a second source of truth that drifts the first time an edit is missed.
 *
 * The SQLite build computed this with correlated subqueries, and had to spell
 * out `"accounts"."id"` in full because an unqualified `id` inside one bound to
 * the wrong table and silently returned zero for every account. Two grouped
 * aggregates and a fold in JS say the same thing without a column reference
 * that can bind to the wrong place.
 */
export async function listAccounts(
  tenant: Tenant,
  options: { includeArchived?: boolean } = {},
): Promise<AccountWithBalance[]> {
  const { db, userId } = tenant;

  const [rows, movement, incoming, logos] = await Promise.all([
    db.account.findMany({
      where: { userId, ...(options.includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),

    db.transaction.groupBy({
      by: ["accountId", "type"],
      where: { userId },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),

    // The receiving half of a transfer hangs off toAccountId, not accountId.
    db.transaction.groupBy({
      by: ["toAccountId"],
      where: { userId, type: "transfer", toAccountId: { not: null } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),

    // The wallet's mark comes from the shared catalog, matched on slug.
    logoIndex(),
  ]);

  // Income adds, everything else - expense and the sending half of a transfer -
  // takes away.
  const out = new Map<string, { delta: number; count: number }>();
  for (const row of movement) {
    const sum = row._sum.amountMinor ?? 0;
    const entry = out.get(row.accountId) ?? { delta: 0, count: 0 };
    entry.delta += row.type === "income" ? sum : -sum;
    entry.count += row._count._all;
    out.set(row.accountId, entry);
  }

  const into = new Map<string, { delta: number; count: number }>();
  for (const row of incoming) {
    if (!row.toAccountId) continue;
    into.set(row.toAccountId, {
      delta: row._sum.amountMinor ?? 0,
      count: row._count._all,
    });
  }

  return rows.map((row) => {
    const sent = out.get(row.id);
    const received = into.get(row.id);
    return {
      ...toAccount(row),
      balanceMinor: row.openingBalanceMinor + (sent?.delta ?? 0) + (received?.delta ?? 0),
      transactionCount: (sent?.count ?? 0) + (received?.count ?? 0),
      logoUrl: (row.slug ? logos.get(row.slug) : undefined) ?? null,
    };
  });
}

/**
 * Add one of the catalog's accounts to this wallet.
 *
 * The slug is copied across deliberately: it is what ties the wallet to its
 * mark, and it is also what an import file matches on. Everything else - the
 * name, the opening balance - is the user's from here on, so an admin renaming
 * the catalog entry never renames somebody's account behind their back.
 */
export async function addAccountFromCatalog(
  tenant: Tenant,
  input: AddFromCatalogInput,
): Promise<string> {
  const entry = await prisma.accountCatalogEntry.findUnique({
    where: { slug: input.catalogSlug },
  });
  if (!entry || entry.archivedAt) {
    throw ApiError.notFound("That account is not in the catalog.");
  }

  const existing = await tenant.db.account.findFirst({
    where: { userId: tenant.userId, slug: entry.slug },
    select: { id: true, name: true, archivedAt: true },
  });

  if (existing) {
    // Already there, just put away. Restoring beats silently making a second one.
    if (existing.archivedAt) {
      await tenant.db.account.updateMany({
        where: { id: existing.id, userId: tenant.userId },
        data: { archivedAt: null },
      });
      return existing.id;
    }
    throw ApiError.conflict(`You already have ${existing.name}.`);
  }

  const last = await tenant.db.account.findFirst({
    where: { userId: tenant.userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return createAccount(tenant, {
    name: input.name?.trim() || entry.name,
    slug: entry.slug,
    type: entry.type as AccountInput["type"],
    icon: entry.icon,
    openingBalanceMinor: input.openingBalanceMinor ?? 0,
    sortOrder: (last?.sortOrder ?? 0) + 1,
  });
}

export async function createAccount(
  tenant: Tenant,
  input: AccountInput & { id?: string },
): Promise<string> {
  const id = input.id ?? randomUUID();
  await tenant.db.account.create({
    data: {
      id,
      userId: tenant.userId,
      slug: input.slug ?? null,
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color ?? null,
      openingBalanceMinor: input.openingBalanceMinor,
      currency: input.currency,
      excludeFromTotals: input.excludeFromTotals,
      sortOrder: input.sortOrder,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    },
  });
  return id;
}

export async function updateAccount(
  tenant: Tenant,
  id: string,
  patch: AccountPatch,
): Promise<void> {
  // updateMany rather than update: the userId belongs in the WHERE clause, so
  // one person's id can never address another person's row.
  await tenant.db.account.updateMany({
    where: { id, userId: tenant.userId },
    data: patch,
  });
}

/** Soft delete: transactions keep their account label. */
export async function archiveAccount(tenant: Tenant, id: string): Promise<void> {
  await tenant.db.account.updateMany({
    where: { id, userId: tenant.userId },
    data: { archivedAt: new Date().toISOString() },
  });
}

export async function restoreAccount(tenant: Tenant, id: string): Promise<void> {
  await tenant.db.account.updateMany({
    where: { id, userId: tenant.userId },
    data: { archivedAt: null },
  });
}
