import { ACCOUNT_TYPES, CATEGORY_KINDS, FREQUENCIES, TRANSACTION_TYPES } from "@advantage/core";
import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Conventions that hold across every table here:
 *
 * - ids are uuid text, generated client-side (there is no server to allocate them)
 * - money is `*_minor`: an INTEGER count of centavos, always a positive magnitude.
 *   Direction lives in `transactions.type`, so no query has to trust a sign.
 * - dates are `YYYY-MM-DD` text, timestamps are ISO strings. SQLite has no date
 *   type and lexicographic ordering on these formats is chronological ordering.
 * - deletes are soft (`archived_at`) for anything a record can point at, so
 *   history never loses its labels.
 */

const id = () => text("id").primaryKey();
const createdAt = () => text("created_at").notNull();

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    slug: text("slug"),
    name: text("name").notNull(),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull().default("cash"),
    icon: text("icon").notNull().default("Wallet"),
    color: text("color"),
    openingBalanceMinor: integer("opening_balance_minor").notNull().default(0),
    currency: text("currency").notNull().default("PHP"),
    excludeFromTotals: integer("exclude_from_totals", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("accounts_slug_idx").on(table.slug)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    slug: text("slug"),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull().default("expense"),
    icon: text("icon").notNull().default("Tag"),
    /** Chart slot token. Null on children: they inherit the parent hue. */
    color: text("color"),
    parentId: text("parent_id"),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("categories_slug_idx").on(table.slug),
    index("categories_parent_idx").on(table.parentId),
    index("categories_kind_idx").on(table.kind),
  ],
);

export const incomeSources = sqliteTable(
  "income_sources",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    /** Asset key the web app maps to a bundled logo file. */
    logo: text("logo"),
    color: text("color"),
    defaultCategoryId: text("default_category_id"),
    defaultAccountId: text("default_account_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("income_sources_slug_idx").on(table.slug)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    /** Positive magnitude in centavos. Direction comes from `type`. */
    amountMinor: integer("amount_minor").notNull(),
    date: text("date").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    /** Destination account - transfers only. */
    toAccountId: text("to_account_id").references(() => accounts.id),
    categoryId: text("category_id").references(() => categories.id),
    incomeSourceId: text("income_source_id").references(() => incomeSources.id),
    payee: text("payee"),
    note: text("note"),
    /** Set when the record was posted from a planned payment. */
    plannedPaymentId: text("planned_payment_id"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("transactions_date_idx").on(table.date),
    index("transactions_type_date_idx").on(table.type, table.date),
    index("transactions_account_idx").on(table.accountId),
    index("transactions_category_idx").on(table.categoryId),
    index("transactions_source_idx").on(table.incomeSourceId),
    index("transactions_planned_idx").on(table.plannedPaymentId),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    /** Null means an overall spending limit rather than a per-category one. */
    categoryId: text("category_id").references(() => categories.id),
    amountMinor: integer("amount_minor").notNull(),
    period: text("period").notNull().default("monthly"),
    /** First month the budget applies to, YYYY-MM. */
    startMonth: text("start_month").notNull(),
    rollover: integer("rollover", { mode: "boolean" }).notNull().default(false),
    archivedAt: text("archived_at"),
    createdAt: createdAt(),
  },
  (table) => [index("budgets_category_idx").on(table.categoryId)],
);

export const plannedPayments = sqliteTable(
  "planned_payments",
  {
    id: id(),
    name: text("name").notNull(),
    type: text("type", { enum: ["expense", "income"] }).notNull().default("expense"),
    amountMinor: integer("amount_minor").notNull(),
    frequency: text("frequency", { enum: FREQUENCIES }).notNull().default("monthly"),
    /** The date the schedule counts from; the due day is read off it. */
    anchorDate: text("anchor_date").notNull(),
    endDate: text("end_date"),
    accountId: text("account_id").references(() => accounts.id),
    categoryId: text("category_id").references(() => categories.id),
    incomeSourceId: text("income_source_id").references(() => incomeSources.id),
    note: text("note"),
    /** Last date a record was posted for this schedule. */
    lastPostedDate: text("last_posted_date"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [index("planned_active_idx").on(table.active)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---- relations -------------------------------------------------------------

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "categoryParent",
  }),
  children: many(categories, { relationName: "categoryParent" }),
  transactions: many(transactions),
}));

export const incomeSourcesRelations = relations(incomeSources, ({ many }) => ({
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
    relationName: "transactionAccount",
  }),
  toAccount: one(accounts, {
    fields: [transactions.toAccountId],
    references: [accounts.id],
    relationName: "transactionToAccount",
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  incomeSource: one(incomeSources, {
    fields: [transactions.incomeSourceId],
    references: [incomeSources.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));

export const plannedPaymentsRelations = relations(plannedPayments, ({ one }) => ({
  account: one(accounts, { fields: [plannedPayments.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [plannedPayments.categoryId], references: [categories.id] }),
  incomeSource: one(incomeSources, {
    fields: [plannedPayments.incomeSourceId],
    references: [incomeSources.id],
  }),
}));

// ---- row types -------------------------------------------------------------

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type IncomeSource = typeof incomeSources.$inferSelect;
export type NewIncomeSource = typeof incomeSources.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type PlannedPayment = typeof plannedPayments.$inferSelect;
export type NewPlannedPayment = typeof plannedPayments.$inferInsert;
export type Setting = typeof settings.$inferSelect;
