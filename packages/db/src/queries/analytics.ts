import {
  monthEnd,
  monthStart,
  type BreakdownInput,
  type MonthKey,
  type MonthTotalsRow,
} from "@advantage/core";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "../client";
import { accounts, categories, incomeSources, transactions } from "../schema";

/**
 * Every aggregate the dashboard needs, computed in SQLite rather than by
 * pulling rows into JS. Transfers are excluded from income and expense totals
 * everywhere: moving money between your own accounts is neither.
 */

const parent = alias(categories, "parent_category");

const incomeSum = sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountMinor} ELSE 0 END), 0)`;
const expenseSum = sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountMinor} ELSE 0 END), 0)`;
const monthExpression = sql<string>`SUBSTR(${transactions.date}, 1, 7)`;

export async function monthTotals(db: Database, month: MonthKey): Promise<MonthTotalsRow> {
  const rows = await db
    .select({ incomeMinor: incomeSum, expenseMinor: expenseSum })
    .from(transactions)
    .where(and(gte(transactions.date, monthStart(month)), lte(transactions.date, monthEnd(month))));

  return {
    month,
    incomeMinor: Number(rows[0]?.incomeMinor ?? 0),
    expenseMinor: Number(rows[0]?.expenseMinor ?? 0),
  };
}

/** One row per month that has records, for the given inclusive window. */
export async function monthlyTotals(
  db: Database,
  fromMonth: MonthKey,
  toMonth: MonthKey,
): Promise<MonthTotalsRow[]> {
  const rows = await db
    .select({
      month: monthExpression,
      incomeMinor: incomeSum,
      expenseMinor: expenseSum,
    })
    .from(transactions)
    .where(
      and(gte(transactions.date, monthStart(fromMonth)), lte(transactions.date, monthEnd(toMonth))),
    )
    .groupBy(monthExpression)
    .orderBy(monthExpression);

  return rows.map((row) => ({
    month: String(row.month),
    incomeMinor: Number(row.incomeMinor ?? 0),
    expenseMinor: Number(row.expenseMinor ?? 0),
  }));
}

const groupId = sql<string>`COALESCE(${parent.id}, ${categories.id}, '__uncategorized__')`;

/**
 * Spending rolled up to the seven top-level groups. Subcategories fold into
 * their parent, so a breakdown chart always has at most seven hues plus the
 * neutral "Uncategorized".
 */
export async function spendByGroup(
  db: Database,
  month: MonthKey,
): Promise<(BreakdownInput & { icon: string })[]> {
  const rows = await db
    .select({
      key: groupId,
      label: sql<string>`COALESCE(${parent.name}, ${categories.name}, 'Uncategorized')`,
      color: sql<string | null>`COALESCE(${parent.color}, ${categories.color})`,
      icon: sql<string | null>`COALESCE(${parent.icon}, ${categories.icon})`,
      amountMinor: sql<number>`SUM(${transactions.amountMinor})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, monthStart(month)),
        lte(transactions.date, monthEnd(month)),
      ),
    )
    .groupBy(groupId);

  return rows.map((row) => ({
    key: String(row.key),
    label: String(row.label),
    color: row.color ?? "chart-other",
    icon: row.icon ?? "Tag",
    amountMinor: Number(row.amountMinor ?? 0),
  }));
}

export interface SourceTotal {
  id: string;
  name: string;
  shortName: string;
  logo: string | null;
  color: string | null;
  amountMinor: number;
}

export async function incomeBySource(db: Database, month: MonthKey): Promise<SourceTotal[]> {
  const rows = await db
    .select({
      id: incomeSources.id,
      name: incomeSources.name,
      shortName: incomeSources.shortName,
      logo: incomeSources.logo,
      color: incomeSources.color,
      amountMinor: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`,
    })
    .from(incomeSources)
    .leftJoin(
      transactions,
      and(
        eq(transactions.incomeSourceId, incomeSources.id),
        eq(transactions.type, "income"),
        gte(transactions.date, monthStart(month)),
        lte(transactions.date, monthEnd(month)),
      ),
    )
    .groupBy(incomeSources.id)
    .orderBy(desc(sql`COALESCE(SUM(${transactions.amountMinor}), 0)`));

  return rows.map((row) => ({ ...row, amountMinor: Number(row.amountMinor ?? 0) }));
}

export interface LargestExpense {
  id: string;
  date: string;
  amountMinor: number;
  payee: string | null;
  note: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string | null;
}

export async function largestExpenses(
  db: Database,
  month: MonthKey,
  limit = 5,
): Promise<LargestExpense[]> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountMinor: transactions.amountMinor,
      payee: transactions.payee,
      note: transactions.note,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: sql<string | null>`COALESCE(${categories.color}, ${parent.color})`,
      accountName: accounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, monthStart(month)),
        lte(transactions.date, monthEnd(month)),
      ),
    )
    .orderBy(desc(transactions.amountMinor))
    .limit(limit);

  return rows.map((row) => ({ ...row, amountMinor: Number(row.amountMinor) }));
}

/** Total net worth across accounts that count toward totals. */
export async function netWorth(db: Database): Promise<number> {
  const rows = await db
    .select({
      // Qualified literally - see the note in queries/accounts.ts.
      total: sql<number>`COALESCE(SUM(
        "accounts"."opening_balance_minor"
        + COALESCE((
            SELECT SUM(CASE t.type WHEN 'income' THEN t.amount_minor ELSE -t.amount_minor END)
            FROM transactions t WHERE t.account_id = "accounts"."id"
          ), 0)
        + COALESCE((
            SELECT SUM(t.amount_minor) FROM transactions t
            WHERE t.to_account_id = "accounts"."id" AND t.type = 'transfer'
          ), 0)
      ), 0)`,
    })
    .from(accounts)
    .where(eq(accounts.excludeFromTotals, false));

  return Number(rows[0]?.total ?? 0);
}
