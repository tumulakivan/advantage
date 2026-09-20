import type { BudgetInput, BudgetRow } from "@advantage/api-client/types";
import { budgetVerdict, monthEnd, monthStart, type MonthKey } from "@advantage/core";
import { randomUUID } from "node:crypto";

import type { Tenant } from "../db/tenant";
import { effectiveColor, toBudget } from "./mappers";

/**
 * Budgets for a month, each with what has actually been spent against it.
 *
 * A budget on a group counts its subcategories too - otherwise a limit on
 * "Food & Dining" would ignore every grocery run. The SQLite build did that
 * with a correlated subquery per budget row; here the month's spending is
 * fetched once, grouped by category, and each budget reads its own slice out
 * of it.
 */
export async function listBudgetsForMonth(
  tenant: Tenant,
  month: MonthKey,
  today = new Date(),
): Promise<BudgetRow[]> {
  const { db, userId } = tenant;

  const [rows, spending, categories] = await Promise.all([
    db.budget.findMany({
      where: { userId, archivedAt: null, startMonth: { lte: month } },
      include: { category: { include: { parent: true } } },
    }),

    db.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        type: "expense",
        date: { gte: monthStart(month), lte: monthEnd(month) },
      },
      _sum: { amountMinor: true },
    }),

    db.category.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    }),
  ]);

  const parentOf = new Map(categories.map((row) => [row.id, row.parentId]));

  const spentByCategory = new Map<string | null, number>();
  let spentOverall = 0;
  for (const row of spending) {
    spentByCategory.set(row.categoryId, row._sum.amountMinor ?? 0);
    spentOverall += row._sum.amountMinor ?? 0;
  }

  const spentFor = (categoryId: string | null): number => {
    // A budget with no category is an overall ceiling: everything counts.
    if (!categoryId) return spentOverall;

    let total = spentByCategory.get(categoryId) ?? 0;
    for (const [id, parentId] of parentOf) {
      if (parentId === categoryId) total += spentByCategory.get(id) ?? 0;
    }
    return total;
  };

  // Budget order follows category order, with the overall ceiling - which has
  // no category - first.
  const ordered = [...rows].sort((a, b) => {
    const left = a.category;
    const right = b.category;
    if (!left || !right) return Number(Boolean(left)) - Number(Boolean(right));
    return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
  });

  return ordered.map((row): BudgetRow => {
    const spentMinor = spentFor(row.categoryId);
    return {
      ...toBudget(row),
      categoryName: row.category?.name ?? null,
      categoryIcon: row.category?.icon ?? null,
      categoryColor: effectiveColor(row.category),
      spentMinor,
      verdict: budgetVerdict(spentMinor, row.amountMinor, month, today),
    };
  });
}

/** One live budget per category (and one overall), so this upserts rather than adds. */
export async function upsertBudget(tenant: Tenant, input: BudgetInput): Promise<string> {
  const existing = await tenant.db.budget.findFirst({
    where: {
      userId: tenant.userId,
      archivedAt: null,
      categoryId: input.categoryId ?? null,
    },
    select: { id: true },
  });

  if (existing) {
    await tenant.db.budget.updateMany({
      where: { id: existing.id, userId: tenant.userId },
      data: { amountMinor: input.amountMinor, rollover: input.rollover ?? false },
    });
    return existing.id;
  }

  const id = randomUUID();
  await tenant.db.budget.create({
    data: {
      id,
      userId: tenant.userId,
      categoryId: input.categoryId ?? null,
      amountMinor: input.amountMinor,
      period: "monthly",
      startMonth: input.startMonth,
      rollover: input.rollover ?? false,
      createdAt: new Date().toISOString(),
    },
  });
  return id;
}

export async function deleteBudget(tenant: Tenant, id: string): Promise<void> {
  await tenant.db.budget.deleteMany({ where: { id, userId: tenant.userId } });
}
