import { monthEnd, monthStart, type Minor, type MonthKey } from "@advantage/core";
import { and, eq, gte, lte, sql } from "drizzle-orm";

import type { Database } from "../client";
import { transactions } from "../schema";
import { listAccounts, type AccountWithBalance } from "./accounts";

/**
 * The wallet view: what each account holds, and what moved through it this
 * month.
 *
 * Balance is all-time and derived from every record; the in/out figures are
 * scoped to the month, because "what is in this account" and "what did this
 * account do lately" are two different questions and conflating them is how a
 * balance starts looking wrong.
 */
export interface AccountActivity extends AccountWithBalance {
  /** Expenses charged to this account inside the month. */
  spentMinor: Minor;
  /** Income received into this account inside the month. */
  receivedMinor: Minor;
  /** Transfers out of, and into, this account inside the month. */
  transferredOutMinor: Minor;
  transferredInMinor: Minor;
  /** Records touching this account inside the month. */
  monthCount: number;
}

export interface WalletTotals {
  balanceMinor: Minor;
  spentMinor: Minor;
  receivedMinor: Minor;
  monthCount: number;
  accountCount: number;
}

export interface Wallet {
  accounts: AccountActivity[];
  /** Across accounts that count toward net worth. */
  totals: WalletTotals;
}

export async function loadWallet(
  db: Database,
  month: MonthKey,
  options: { includeArchived?: boolean } = {},
): Promise<Wallet> {
  const from = monthStart(month);
  const to = monthEnd(month);

  const [accountRows, movement, incoming] = await Promise.all([
    listAccounts(db, options),

    db
      .select({
        accountId: transactions.accountId,
        spentMinor: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountMinor} ELSE 0 END), 0)`,
        receivedMinor: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountMinor} ELSE 0 END), 0)`,
        transferredOutMinor: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amountMinor} ELSE 0 END), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(transactions.accountId),

    // The receiving half of a transfer hangs off to_account_id, not account_id.
    db
      .select({
        accountId: transactions.toAccountId,
        transferredInMinor: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, "transfer"),
          gte(transactions.date, from),
          lte(transactions.date, to),
        ),
      )
      .groupBy(transactions.toAccountId),
  ]);

  const out = new Map(movement.map((row) => [row.accountId, row]));
  const into = new Map(incoming.map((row) => [row.accountId, row]));

  const accountsWithActivity: AccountActivity[] = accountRows.map((account) => {
    const sent = out.get(account.id);
    const received = into.get(account.id);

    return {
      ...account,
      spentMinor: Number(sent?.spentMinor ?? 0),
      receivedMinor: Number(sent?.receivedMinor ?? 0),
      transferredOutMinor: Number(sent?.transferredOutMinor ?? 0),
      transferredInMinor: Number(received?.transferredInMinor ?? 0),
      monthCount: Number(sent?.count ?? 0) + Number(received?.count ?? 0),
    };
  });

  const counted = accountsWithActivity.filter((account) => !account.excludeFromTotals);

  return {
    accounts: accountsWithActivity,
    totals: {
      balanceMinor: counted.reduce((sum, account) => sum + account.balanceMinor, 0),
      spentMinor: counted.reduce((sum, account) => sum + account.spentMinor, 0),
      receivedMinor: counted.reduce((sum, account) => sum + account.receivedMinor, 0),
      monthCount: counted.reduce((sum, account) => sum + account.monthCount, 0),
      accountCount: counted.length,
    },
  };
}
