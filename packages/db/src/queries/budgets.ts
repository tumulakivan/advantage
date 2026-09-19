import { budgetVerdict, monthEnd, monthStart, type BudgetVerdict, type MonthKey } from "@advantage/core";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "../client";
import { budgets, categories, type Budget, type NewBudget } from "../schema";

const parent = alias(categories, "parent_category");

export interface BudgetRow extends Budget {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  spentMinor: number;
  verdict: BudgetVerdict;
}

/**
 * Budgets for a month, each with what has actually been spent against it.
 * A budget on a group counts its subcategories too - otherwise a limit on
 * "Food & Dining" would ignore every grocery run.
 */
export async function listBudgetsForMonth(
  db: Database,
  month: MonthKey,
  today = new Date(),
): Promise<BudgetRow[]> {
  const start = monthStart(month);
  const end = monthEnd(month);

  const rows = await db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      amountMinor: budgets.amountMinor,
      period: budgets.period,
      startMonth: budgets.startMonth,
      rollover: budgets.rollover,
      archivedAt: budgets.archivedAt,
      createdAt: budgets.createdAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: sql<string | null>`COALESCE(${categories.color}, ${parent.color})`,
      spentMinor: sql<number>`COALESCE((
        SELECT SUM(t.amount_minor)
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.type = 'expense'
          AND t.date >= ${start}
          AND t.date <= ${end}
          AND (
            ${budgets.categoryId} IS NULL
            OR t.category_id = ${budgets.categoryId}
            OR c.parent_id = ${budgets.categoryId}
          )
      ), 0)`,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .where(and(isNull(budgets.archivedAt), lte(budgets.startMonth, month)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => {
    const spentMinor = Number(row.spentMinor ?? 0);
    return {
      ...row,
      spentMinor,
      verdict: budgetVerdict(spentMinor, row.amountMinor, month, today),
    };
  });
}

export async function upsertBudget(
  db: Database,
  input: { categoryId: string | null; amountMinor: number; startMonth: string; rollover?: boolean },
): Promise<string> {
  const existing = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(
      and(
        isNull(budgets.archivedAt),
        input.categoryId
          ? eq(budgets.categoryId, input.categoryId)
          : isNull(budgets.categoryId),
      ),
    )
    .limit(1);

  const current = existing[0];
  if (current) {
    await db
      .update(budgets)
      .set({ amountMinor: input.amountMinor, rollover: input.rollover ?? false })
      .where(eq(budgets.id, current.id));
    return current.id;
  }

  const id = crypto.randomUUID();
  await db.insert(budgets).values({
    id,
    categoryId: input.categoryId,
    amountMinor: input.amountMinor,
    period: "monthly",
    startMonth: input.startMonth,
    rollover: input.rollover ?? false,
    createdAt: new Date().toISOString(),
  } satisfies NewBudget);
  return id;
}

export async function deleteBudget(db: Database, id: string): Promise<void> {
  await db.delete(budgets).where(eq(budgets.id, id));
}
