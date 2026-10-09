import type {
  AccountActivity,
  AccountActivityDetail,
  AccountBreakdownLine,
  Wallet,
} from "@advantage/api-client/types";
import {
  buildCashflowSeries,
  monthEnd,
  monthRange,
  monthStart,
  type MonthKey,
  type MonthTotalsRow,
} from "@advantage/core";

import { ApiError } from "../errors";

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

/**
 * One account up close, for the wallet's pop-up: six months of its cash flow,
 * and the selected month broken down by category group on both sides.
 *
 * Income and spending follow the same rule as everywhere else - transfers and
 * adjustments are neither - but both are reported apart, because on a single
 * account they are often most of what happened.
 */
export async function loadAccountActivity(
  tenant: Tenant,
  accountId: string,
  month: MonthKey,
  locale: string,
): Promise<AccountActivityDetail> {
  const { db, userId } = tenant;

  const account = await db.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) throw ApiError.notFound("That account does not exist.");

  const months = monthRange(month, 6);
  const from = monthStart(months[0] ?? month);
  const to = monthEnd(month);

  const [rows, incoming] = await Promise.all([
    db.transaction.findMany({
      where: { userId, accountId, date: { gte: from, lte: to } },
      select: {
        date: true,
        type: true,
        amountMinor: true,
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
            color: true,
            parent: { select: { id: true, name: true, icon: true, color: true } },
          },
        },
      },
    }),
    db.transaction.aggregate({
      where: {
        userId,
        type: "transfer",
        toAccountId: accountId,
        date: { gte: monthStart(month), lte: to },
      },
      _sum: { amountMinor: true },
    }),
  ]);

  const byMonth = new Map<string, MonthTotalsRow>();
  const income = new Map<string, AccountBreakdownLine>();
  const spending = new Map<string, AccountBreakdownLine>();
  let transferredOutMinor = 0;
  let adjustmentsMinor = 0;

  for (const row of rows) {
    const inMonth = row.date >= monthStart(month);

    if (row.type === "income" || row.type === "expense") {
      const key = row.date.slice(0, 7);
      const totals = byMonth.get(key) ?? { month: key, incomeMinor: 0, expenseMinor: 0 };
      if (row.type === "income") totals.incomeMinor += row.amountMinor;
      else totals.expenseMinor += row.amountMinor;
      byMonth.set(key, totals);

      if (!inMonth) continue;
      const group = row.category?.parent ?? row.category;
      const lines = row.type === "income" ? income : spending;
      const lineKey = group?.id ?? "__uncategorized__";
      const line = lines.get(lineKey) ?? {
        key: lineKey,
        label: group?.name ?? "Uncategorized",
        icon: group?.icon ?? "Tag",
        color: group?.color ?? null,
        amountMinor: 0,
        count: 0,
      };
      line.amountMinor += row.amountMinor;
      line.count += 1;
      lines.set(lineKey, line);
      continue;
    }

    if (!inMonth) continue;
    if (row.type === "transfer") transferredOutMinor += row.amountMinor;
    else if (row.type === "adjustment") adjustmentsMinor += row.amountMinor;
  }

  const largestFirst = (lines: Map<string, AccountBreakdownLine>) =>
    [...lines.values()].sort((a, b) => b.amountMinor - a.amountMinor);

  return {
    accountId,
    month,
    cashflow: buildCashflowSeries([...byMonth.values()], months, locale),
    income: largestFirst(income),
    spending: largestFirst(spending),
    transferredInMinor: incoming._sum.amountMinor ?? 0,
    transferredOutMinor,
    adjustmentsMinor,
  };
}
