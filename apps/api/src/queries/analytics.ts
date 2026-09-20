import type {
  GroupBreakdown,
  LargestExpense,
  SourceTotal,
} from "@advantage/api-client/types";
import { monthEnd, monthStart, type MonthKey, type MonthTotalsRow } from "@advantage/core";

import type { Tenant } from "../db/tenant";
import { listAccounts } from "./accounts";
import { effectiveColor } from "./mappers";

/**
 * Every aggregate the dashboard needs. Transfers are excluded from income and
 * expense totals everywhere: moving money between your own accounts is neither.
 */

export async function monthTotals(tenant: Tenant, month: MonthKey): Promise<MonthTotalsRow> {
  const rows = await tenant.db.transaction.groupBy({
    by: ["type"],
    where: {
      userId: tenant.userId,
      date: { gte: monthStart(month), lte: monthEnd(month) },
      type: { in: ["income", "expense"] },
    },
    _sum: { amountMinor: true },
  });

  const byType = new Map(rows.map((row) => [row.type, row._sum.amountMinor ?? 0]));

  return {
    month,
    incomeMinor: byType.get("income") ?? 0,
    expenseMinor: byType.get("expense") ?? 0,
  };
}

/**
 * One row per month that has records, for the given inclusive window.
 *
 * The only raw SQL left in the service. Grouping by the month prefix of a date
 * string is the one thing Prisma's query builder cannot express, and folding a
 * year of rows in JS to avoid it would be worse. `substring(... from 1 for 7)`
 * is standard SQL and was `SUBSTR(date, 1, 7)` before.
 */
export async function monthlyTotals(
  tenant: Tenant,
  fromMonth: MonthKey,
  toMonth: MonthKey,
): Promise<MonthTotalsRow[]> {
  const rows = await tenant.db.$queryRaw<
    { month: string; income: bigint; expense: bigint }[]
  >`
    SELECT substring(t."date" from 1 for 7) AS month,
           COALESCE(SUM(CASE WHEN t."type" = 'income'  THEN t."amountMinor" ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN t."type" = 'expense' THEN t."amountMinor" ELSE 0 END), 0) AS expense
      FROM "transactions" t
     WHERE t."userId" = ${tenant.userId}
       AND t."date" >= ${monthStart(fromMonth)}
       AND t."date" <= ${monthEnd(toMonth)}
     GROUP BY 1
     ORDER BY 1
  `;

  return rows.map((row) => ({
    month: row.month,
    incomeMinor: Number(row.income),
    expenseMinor: Number(row.expense),
  }));
}

/**
 * Spending rolled up to the seven top-level groups. Subcategories fold into
 * their parent, so a breakdown chart always has at most seven hues plus the
 * neutral "Uncategorized".
 */
export async function spendByGroup(
  tenant: Tenant,
  month: MonthKey,
): Promise<GroupBreakdown[]> {
  const rows = await tenant.db.transaction.findMany({
    where: {
      userId: tenant.userId,
      type: "expense",
      date: { gte: monthStart(month), lte: monthEnd(month) },
    },
    select: {
      amountMinor: true,
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          parent: { select: { id: true, name: true, color: true, icon: true } },
        },
      },
    },
  });

  const groups = new Map<string, GroupBreakdown>();

  for (const row of rows) {
    const group = row.category?.parent ?? row.category;
    const key = group?.id ?? "__uncategorized__";

    const existing = groups.get(key);
    if (existing) {
      existing.amountMinor += row.amountMinor;
      continue;
    }

    groups.set(key, {
      key,
      label: group?.name ?? "Uncategorized",
      color: group?.color ?? "chart-other",
      icon: group?.icon ?? "Tag",
      amountMinor: row.amountMinor,
    });
  }

  return [...groups.values()];
}

export async function incomeBySource(
  tenant: Tenant,
  month: MonthKey,
): Promise<SourceTotal[]> {
  const [sources, totals] = await Promise.all([
    tenant.db.incomeSource.findMany({ where: { userId: tenant.userId } }),
    tenant.db.transaction.groupBy({
      by: ["incomeSourceId"],
      where: {
        userId: tenant.userId,
        type: "income",
        date: { gte: monthStart(month), lte: monthEnd(month) },
      },
      _sum: { amountMinor: true },
    }),
  ]);

  const byId = new Map(
    totals
      .filter((row) => row.incomeSourceId)
      .map((row) => [row.incomeSourceId!, row._sum.amountMinor ?? 0]),
  );

  return sources
    .map((source) => ({
      id: source.id,
      name: source.name,
      shortName: source.shortName,
      logo: source.logo,
      color: source.color,
      amountMinor: byId.get(source.id) ?? 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export async function largestExpenses(
  tenant: Tenant,
  month: MonthKey,
  limit = 5,
): Promise<LargestExpense[]> {
  const rows = await tenant.db.transaction.findMany({
    where: {
      userId: tenant.userId,
      type: "expense",
      date: { gte: monthStart(month), lte: monthEnd(month) },
    },
    include: { category: { include: { parent: true } }, account: true },
    orderBy: { amountMinor: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    amountMinor: row.amountMinor,
    payee: row.payee,
    note: row.note,
    categoryName: row.category?.name ?? null,
    categoryIcon: row.category?.icon ?? null,
    categoryColor: effectiveColor(row.category),
    accountName: row.account?.name ?? null,
  }));
}

/**
 * Total net worth across accounts that count toward totals - archived ones
 * included, because money in an account you stopped using is still money.
 */
export async function netWorth(tenant: Tenant): Promise<number> {
  const accounts = await listAccounts(tenant, { includeArchived: true });
  return accounts
    .filter((account) => !account.excludeFromTotals)
    .reduce((sum, account) => sum + account.balanceMinor, 0);
}
