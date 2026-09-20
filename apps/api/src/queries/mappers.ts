import type {
  Account,
  Budget,
  Category,
  IncomeSource,
  PlannedPayment,
  Setting,
  Transaction,
} from "@advantage/api-client/types";
import type { AccountType, CategoryKind, Frequency, TransactionType } from "@advantage/core";
import type {
  Account as AccountModel,
  Budget as BudgetModel,
  Category as CategoryModel,
  IncomeSource as IncomeSourceModel,
  PlannedPayment as PlannedPaymentModel,
  Setting as SettingModel,
  Transaction as TransactionModel,
} from "@prisma/client";

/**
 * Prisma row to wire row.
 *
 * Two jobs, both small and both worth doing in one place. It drops `userId` -
 * the caller already knows whose data they asked for, and leaving it out keeps
 * the backup file identical to the one the SQLite build wrote. And it narrows
 * the text columns that carry a union back to that union, which Postgres
 * cannot do for us without seven enum types that a migration would then have
 * to keep in step with `@advantage/core`.
 */

export function toAccount(row: AccountModel): Account {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type as AccountType,
    icon: row.icon,
    color: row.color,
    openingBalanceMinor: row.openingBalanceMinor,
    currency: row.currency,
    excludeFromTotals: row.excludeFromTotals,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

export function toCategory(row: CategoryModel): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind as CategoryKind,
    icon: row.icon,
    color: row.color,
    parentId: row.parentId,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

export function toIncomeSource(row: IncomeSourceModel): IncomeSource {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    logo: row.logo,
    color: row.color,
    defaultCategoryId: row.defaultCategoryId,
    defaultAccountId: row.defaultAccountId,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

export function toTransaction(row: TransactionModel): Transaction {
  return {
    id: row.id,
    type: row.type as TransactionType,
    amountMinor: row.amountMinor,
    date: row.date,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    incomeSourceId: row.incomeSourceId,
    payee: row.payee,
    note: row.note,
    plannedPaymentId: row.plannedPaymentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toBudget(row: BudgetModel): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    amountMinor: row.amountMinor,
    period: row.period,
    startMonth: row.startMonth,
    rollover: row.rollover,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

export function toPlannedPayment(row: PlannedPaymentModel): PlannedPayment {
  return {
    id: row.id,
    name: row.name,
    type: row.type as "expense" | "income",
    amountMinor: row.amountMinor,
    frequency: row.frequency as Frequency,
    anchorDate: row.anchorDate,
    endDate: row.endDate,
    accountId: row.accountId,
    categoryId: row.categoryId,
    incomeSourceId: row.incomeSourceId,
    note: row.note,
    lastPostedDate: row.lastPostedDate,
    active: row.active,
    createdAt: row.createdAt,
  };
}

export function toSetting(row: SettingModel): Setting {
  return { key: row.key, value: row.value };
}

/**
 * A subcategory has no hue of its own - it wears its group's. This was a
 * `COALESCE` in every SELECT before; it is one function now.
 */
export function effectiveColor(
  category: { color: string | null; parent?: { color: string | null } | null } | null,
): string | null {
  if (!category) return null;
  return category.color ?? category.parent?.color ?? null;
}
