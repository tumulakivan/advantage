import {
  DEFAULT_SETTINGS,
  SEED_ACCOUNTS,
  SEED_CATEGORIES,
  SEED_INCOME_SOURCES,
  currentMonthKey,
  dueDateIn,
} from "@advantage/core";

import type { Database } from "./client";
import {
  accounts,
  categories,
  incomeSources,
  plannedPayments,
  settings,
  type NewCategory,
} from "./schema";

/**
 * First-run seed. Idempotent by construction: it bails unless the categories
 * table is empty, so a reload never duplicates the taxonomy.
 */
export async function seedIfEmpty(db: Database): Promise<boolean> {
  const existing = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing.length > 0) return false;

  const now = new Date().toISOString();
  const month = currentMonthKey();

  // ---- accounts ----
  const accountIds = new Map<string, string>();
  const accountRows = SEED_ACCOUNTS.map((account, index) => {
    const id = crypto.randomUUID();
    accountIds.set(account.slug, id);
    return {
      id,
      slug: account.slug,
      name: account.name,
      type: account.type,
      icon: account.icon,
      openingBalanceMinor: account.openingBalanceMinor,
      currency: DEFAULT_SETTINGS.currency,
      sortOrder: index,
      createdAt: now,
    };
  });
  await db.insert(accounts).values(accountRows);

  // ---- categories: parents first, so children can point at a real id ----
  const categoryIds = new Map<string, string>();
  const parents = SEED_CATEGORIES.filter((category) => !category.parent);
  const children = SEED_CATEGORIES.filter((category) => category.parent);

  const toRow = (
    category: (typeof SEED_CATEGORIES)[number],
    index: number,
  ): NewCategory => {
    const id = crypto.randomUUID();
    categoryIds.set(category.slug, id);
    return {
      id,
      slug: category.slug,
      name: category.name,
      kind: category.kind,
      icon: category.icon,
      color: category.color,
      parentId: category.parent ? (categoryIds.get(category.parent) ?? null) : null,
      isSystem: true,
      sortOrder: index,
      createdAt: now,
    };
  };

  await db.insert(categories).values(parents.map(toRow));
  await db.insert(categories).values(children.map(toRow));

  // ---- income sources ----
  await db.insert(incomeSources).values(
    SEED_INCOME_SOURCES.map((source, index) => ({
      id: crypto.randomUUID(),
      slug: source.slug,
      name: source.name,
      shortName: source.shortName,
      logo: source.logo,
      color: source.color,
      defaultCategoryId: categoryIds.get(source.defaultCategory) ?? null,
      defaultAccountId: accountIds.get("maribank") ?? null,
      sortOrder: index,
      createdAt: now,
    })),
  );

  const sourceRows = await db
    .select({ id: incomeSources.id, slug: incomeSources.slug })
    .from(incomeSources);
  const sourceIds = new Map(sourceRows.map((row) => [row.slug, row.id]));

  // ---- a starting schedule, so the Planned screen is not empty on a first
  // run. The amounts are round placeholders: replace them, or import a plan
  // file with your own. ----
  await db.insert(plannedPayments).values([
    {
      id: crypto.randomUUID(),
      name: "Internet",
      type: "expense" as const,
      amountMinor: 100_000,
      frequency: "monthly" as const,
      anchorDate: dueDateIn(month, 1),
      accountId: accountIds.get("maribank") ?? null,
      categoryId: categoryIds.get("bills-internet") ?? null,
      note: "Set your own amount and due date.",
      active: true,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Electricity",
      type: "expense" as const,
      amountMinor: 100_000,
      frequency: "monthly" as const,
      anchorDate: dueDateIn(month, 1),
      accountId: accountIds.get("maribank") ?? null,
      categoryId: categoryIds.get("bills-electricity") ?? null,
      note: "Set your own amount and due date.",
      active: true,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Rental payout",
      type: "income" as const,
      amountMinor: 0,
      frequency: "monthly" as const,
      anchorDate: dueDateIn(month, 1),
      accountId: accountIds.get("maribank") ?? null,
      categoryId: categoryIds.get("income-rental") ?? null,
      incomeSourceId: sourceIds.get("live-luxe") ?? null,
      active: true,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Salary",
      type: "income" as const,
      amountMinor: 0,
      frequency: "monthly" as const,
      anchorDate: dueDateIn(month, 1),
      accountId: accountIds.get("maribank") ?? null,
      categoryId: categoryIds.get("income-salary") ?? null,
      incomeSourceId: sourceIds.get("mentis") ?? null,
      active: true,
      createdAt: now,
    },
  ]);

  // ---- settings ----
  await db.insert(settings).values([
    { key: "currency", value: DEFAULT_SETTINGS.currency },
    { key: "locale", value: DEFAULT_SETTINGS.locale },
    { key: "monthStartDay", value: String(DEFAULT_SETTINGS.monthStartDay) },
    { key: "theme", value: DEFAULT_SETTINGS.theme },
    { key: "seededAt", value: now },
  ]);

  return true;
}
