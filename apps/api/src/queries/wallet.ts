import type { AccountActivity, Wallet } from "@advantage/api-client/types";
import { monthEnd, monthStart, type MonthKey } from "@advantage/core";

import type { Tenant } from "../db/tenant";
import { listAccounts } from "./accounts";

/**
 * The wallet view: what each account holds, and what moved through it this
 * month.
 *
 * Balance is all-time and derived from every record; the in/out figures are
 * scoped to the month, because "what is in this account" and "what did this
 * account do lately" are two different questions and conflating them is how a
 * balance starts looking wrong.
 */
export async function loadWallet(
  tenant: Tenant,
  month: MonthKey,
  options: { includeArchived?: boolean } = {},
): Promise<Wallet> {
  const from = monthStart(month);
  const to = monthEnd(month);
  const { db, userId } = tenant;

  const [accountRows, movement, incoming] = await Promise.all([
    listAccounts(tenant, options),

    db.transaction.groupBy({
      by: ["accountId", "type"],
      where: { userId, date: { gte: from, lte: to } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),

    // The receiving half of a transfer hangs off toAccountId, not accountId.
    db.transaction.groupBy({
      by: ["toAccountId"],
      where: { userId, type: "transfer", toAccountId: { not: null }, date: { gte: from, lte: to } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
  ]);

  interface Movement {
    spentMinor: number;
    receivedMinor: number;
    transferredOutMinor: number;
    count: number;
  }

  const out = new Map<string, Movement>();
  for (const row of movement) {
    const sum = row._sum.amountMinor ?? 0;
    const entry = out.get(row.accountId) ?? {
      spentMinor: 0,
      receivedMinor: 0,
      transferredOutMinor: 0,
      count: 0,
    };
    if (row.type === "expense") entry.spentMinor += sum;
    else if (row.type === "income") entry.receivedMinor += sum;
    else if (row.type === "transfer") entry.transferredOutMinor += sum;
    entry.count += row._count._all;
    out.set(row.accountId, entry);
  }

  const into = new Map<string, { amount: number; count: number }>();
  for (const row of incoming) {
    if (!row.toAccountId) continue;
    into.set(row.toAccountId, {
      amount: row._sum.amountMinor ?? 0,
      count: row._count._all,
    });
  }

  const accounts: AccountActivity[] = accountRows.map((account) => {
    const sent = out.get(account.id);
    const received = into.get(account.id);

    return {
      ...account,
      spentMinor: sent?.spentMinor ?? 0,
      receivedMinor: sent?.receivedMinor ?? 0,
      transferredOutMinor: sent?.transferredOutMinor ?? 0,
      transferredInMinor: received?.amount ?? 0,
      monthCount: (sent?.count ?? 0) + (received?.count ?? 0),
    };
  });

  const counted = accounts.filter((account) => !account.excludeFromTotals);

  return {
    accounts,
    totals: {
      balanceMinor: counted.reduce((sum, account) => sum + account.balanceMinor, 0),
      spentMinor: counted.reduce((sum, account) => sum + account.spentMinor, 0),
      receivedMinor: counted.reduce((sum, account) => sum + account.receivedMinor, 0),
      monthCount: counted.reduce((sum, account) => sum + account.monthCount, 0),
      accountCount: counted.length,
    },
  };
}
