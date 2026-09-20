import type {
  AccountType,
  AppSettings,
  BreakdownInput,
  BreakdownResult,
  BudgetVerdict,
  CashflowPoint,
  CategoryKind,
  Frequency,
  IsoDate,
  Kpis,
  Minor,
  MonthKey,
  Outlook,
  OutlookEntry,
  TransactionType,
} from "@advantage/core";

/**
 * The wire contract, shared by the Express service and the browser app.
 *
 * These are the shapes that used to be inferred from the Drizzle schema. Now
 * that a network sits in the middle they are written out once, in a package
 * both sides import, so a field renamed on the server fails to compile in the
 * client rather than arriving as `undefined` at runtime.
 *
 * `userId` is deliberately absent from every row. The server only ever answers
 * with rows belonging to the caller, so repeating whose they are would be
 * noise - and it keeps the backup file identical to the one the local-first
 * build produced.
 */

// ---- rows -------------------------------------------------------------------

export interface Account {
  id: string;
  slug: string | null;
  name: string;
  type: AccountType;
  icon: string;
  color: string | null;
  openingBalanceMinor: Minor;
  currency: string;
  excludeFromTotals: boolean;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: string | null;
  name: string;
  kind: CategoryKind;
  icon: string;
  /** Chart slot token. Null on children: they inherit the parent hue. */
  color: string | null;
  parentId: string | null;
  isSystem: boolean;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface IncomeSource {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  /**
   * @deprecated Income sources are text only. The column is still here so a
   * backup written by an older build restores without being rewritten; nothing
   * reads it.
   */
  logo: string | null;
  color: string | null;
  defaultCategoryId: string | null;
  defaultAccountId: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Positive magnitude in centavos. Direction comes from `type`. */
  amountMinor: Minor;
  date: IsoDate;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  incomeSourceId: string | null;
  payee: string | null;
  note: string | null;
  plannedPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  /** Null means an overall spending limit rather than a per-category one. */
  categoryId: string | null;
  amountMinor: Minor;
  period: string;
  startMonth: MonthKey;
  rollover: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface PlannedPayment {
  id: string;
  name: string;
  type: "expense" | "income";
  amountMinor: Minor;
  frequency: Frequency;
  anchorDate: IsoDate;
  endDate: IsoDate | null;
  accountId: string | null;
  categoryId: string | null;
  incomeSourceId: string | null;
  note: string | null;
  lastPostedDate: IsoDate | null;
  active: boolean;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
}

// ---- write shapes -----------------------------------------------------------

/**
 * What a create call has to supply, as opposed to what a row holds.
 *
 * Only the fields with no sensible default are required; the rest are filled in
 * server-side and these types say so, rather than making every caller spell out
 * `sortOrder: 0`. They are written out instead of derived from the row types
 * because they have to agree with the validation schemas in `apps/api`, and a
 * derived type would drift from those silently.
 */
export interface AccountInput {
  name: string;
  slug?: string | null;
  type?: AccountType;
  icon?: string;
  color?: string | null;
  openingBalanceMinor?: Minor;
  currency?: string;
  excludeFromTotals?: boolean;
  sortOrder?: number;
}
export type AccountPatch = Partial<AccountInput>;

export interface CategoryInput {
  name: string;
  slug?: string | null;
  kind?: CategoryKind;
  icon?: string;
  color?: string | null;
  parentId?: string | null;
  isSystem?: boolean;
  sortOrder?: number;
}
export type CategoryPatch = Partial<CategoryInput>;

export interface TransactionInput {
  type: TransactionType;
  amountMinor: Minor;
  date: IsoDate;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  incomeSourceId?: string | null;
  payee?: string | null;
  note?: string | null;
  plannedPaymentId?: string | null;
}
export type TransactionPatch = Partial<TransactionInput>;

export interface PlannedInput {
  name: string;
  amountMinor: Minor;
  anchorDate: IsoDate;
  type?: "expense" | "income";
  frequency?: Frequency;
  endDate?: IsoDate | null;
  accountId?: string | null;
  categoryId?: string | null;
  incomeSourceId?: string | null;
  note?: string | null;
  lastPostedDate?: IsoDate | null;
  active?: boolean;
}
export type PlannedPatch = Partial<PlannedInput>;

export interface BudgetInput {
  categoryId: string | null;
  amountMinor: Minor;
  startMonth: MonthKey;
  rollover?: boolean;
}

export type IncomeSourcePatch = Partial<
  Omit<IncomeSource, "id" | "createdAt" | "slug">
>;

export interface IncomeSourceInput {
  name: string;
  /** Falls back to the name when left out, which is usually what is wanted. */
  shortName?: string;
  /** A chart slot, so the picker chip is distinguishable at a glance. */
  color?: string | null;
  defaultCategoryId?: string | null;
  defaultAccountId?: string | null;
}

// ---- the shared account catalog ---------------------------------------------

/**
 * A known account, curated by an admin and offered to everyone. The one thing
 * in the API that is not scoped to the caller.
 */
export interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  type: AccountType;
  /** Lucide glyph, used whenever there is no logo. */
  icon: string;
  /** Path on the API, already carrying a cache-busting version. Null if none. */
  logoUrl: string | null;
  sortOrder: number;
  archivedAt: string | null;
}

export interface CatalogEntryInput {
  name: string;
  type: AccountType;
  icon: string;
  slug?: string;
  sortOrder?: number;
  /** Base64 or a `data:` URL. Has to be square. */
  logo?: string | null;
}

export interface CatalogEntryPatch {
  name?: string;
  type?: AccountType;
  icon?: string;
  sortOrder?: number;
  archivedAt?: string | null;
  /** Omit to leave the logo alone, `null` to remove it, a string to replace it. */
  logo?: string | null;
}

/** What adding a catalog account to your own wallet needs. */
export interface AddFromCatalogInput {
  catalogSlug: string;
  openingBalanceMinor?: Minor;
  /** Override the catalog name, for "GCash (business)" and the like. */
  name?: string;
}

// ---- admin ------------------------------------------------------------------

/**
 * Usage only. There is deliberately no amount, payee or per-user row anywhere
 * in this shape - an admin screen is exactly where someone's salary would end
 * up being read by a person with no business seeing it.
 */
export interface AdminMetrics {
  users: {
    total: number;
    verified: number;
    newLast7: number;
    newLast30: number;
    activeLast7: number;
    activeLast30: number;
  };
  ledger: {
    transactions: number;
    accounts: number;
    plannedPayments: number;
    budgets: number;
    incomeSources: number;
  };
  catalog: { total: number; withLogo: number };
  signupsByWeek: { week: string; signups: number }[];
  /** How many wallets carry each catalog slug - what to add to the catalog next. */
  accountPopularity: { slug: string; wallets: number }[];
  generatedAt: string;
}

// ---- derived reads ----------------------------------------------------------

export interface AccountWithBalance extends Account {
  balanceMinor: Minor;
  transactionCount: number;
  /**
   * Resolved from the shared catalog by slug, or null for a wallet the catalog
   * does not know about. Matching on slug rather than an id is what lets a
   * renamed account keep its mark.
   */
  logoUrl: string | null;
}

export interface CategoryNode extends Category {
  children: Category[];
  /** Resolved hue: a child inherits its parent slot. */
  effectiveColor: string | null;
  usageCount: number;
}

/** Flat list for a picker: parents with their children indented beneath them. */
export interface CategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  parentId: string | null;
  parentName: string | null;
  depth: 0 | 1;
}

export interface TransactionRow extends Transaction {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  parentCategoryName: string | null;
  accountName: string | null;
  accountIcon: string | null;
  toAccountName: string | null;
  sourceName: string | null;
  sourceShortName: string | null;
  sourceColor: string | null;
}

export interface TransactionFilters {
  types?: TransactionType[];
  accountId?: string;
  /** Matches the category itself or any of its children. */
  categoryId?: string;
  incomeSourceId?: string;
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BudgetRow extends Budget {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  spentMinor: Minor;
  verdict: BudgetVerdict;
}

export interface PlannedRow extends PlannedPayment {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string | null;
  sourceName: string | null;
  sourceColor: string | null;
  /** Next due date, or null for a finished schedule. */
  nextDueDate: IsoDate | null;
  /** Negative when already overdue. */
  daysUntilDue: number | null;
  /** True once a record has been posted for the current occurrence. */
  postedForCurrent: boolean;
}

export interface SourceTotal {
  id: string;
  name: string;
  shortName: string;
  logo: string | null;
  color: string | null;
  amountMinor: Minor;
}

export interface LargestExpense {
  id: string;
  date: IsoDate;
  amountMinor: Minor;
  payee: string | null;
  note: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string | null;
}

export type GroupBreakdown = BreakdownInput & { icon: string };

// ---- the wallet -------------------------------------------------------------

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

// ---- screen payloads --------------------------------------------------------

/**
 * The dashboard used to fire about twelve queries on load, which is free
 * against a local file and a thundering herd over a network. It is one request
 * now, assembled server-side.
 */
export interface DashboardData {
  kpis: Kpis;
  cashflow: CashflowPoint[];
  breakdown: BreakdownResult;
  sources: SourceTotal[];
  largest: LargestExpense[];
  netWorthMinor: Minor;
}

export interface OutlookData {
  outlook: Outlook;
  entries: OutlookEntry[];
}

export type DatabaseStats = Record<string, number>;

// ---- files in and out -------------------------------------------------------

export const BACKUP_FORMAT = "advantage-backup";
export const RECORDS_FORMAT = "advantage-records";
export const PLAN_FORMAT = "advantage-plan";

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  tables: {
    accounts: Account[];
    categories: Category[];
    incomeSources: IncomeSource[];
    transactions: Transaction[];
    budgets: Budget[];
    plannedPayments: PlannedPayment[];
    settings: Setting[];
  };
}

export interface RecordImportRow {
  type: TransactionType;
  /** Major units (pesos). Sign is ignored; `type` decides direction. */
  amount: number;
  date: IsoDate;
  /** Category slug or name. Unknown values land as uncategorized. */
  category?: string | null;
  /** Account slug or name. Falls back to the first account. */
  account?: string | null;
  /** Income source slug or name. */
  source?: string | null;
  payee?: string | null;
  note?: string | null;
}

export interface RecordsPayload {
  format: typeof RECORDS_FORMAT;
  version: 1;
  records: RecordImportRow[];
}

export interface ImportSummary {
  inserted: number;
  skipped: number;
  unresolvedCategories: string[];
}

export interface PlanItem {
  name: string;
  type: "expense" | "income";
  /** Major units. Always a magnitude; `type` carries the direction. */
  amount: number;
  /** The first (or only) date it lands. */
  date: IsoDate;
  frequency: Frequency;
  /** Last date the schedule may produce, for a series that ends. */
  endDate?: IsoDate | null;
  category?: string | null;
  account?: string | null;
  source?: string | null;
  note?: string | null;
}

/**
 * An account the plan expects to exist. Matched by slug, so importing twice
 * updates rather than duplicates - and so a renamed account keeps its identity.
 */
export interface PlanAccount {
  slug: string;
  name: string;
  type: AccountType;
  icon?: string;
  /** Major units. What the account held when it was last counted. */
  openingBalance?: number;
  excludeFromTotals?: boolean;
}

export interface PlanPayload {
  format: typeof PLAN_FORMAT;
  version: 1;
  name?: string;
  preparedOn?: string;
  /** Wipe the existing schedule first. A plan file is a complete schedule. */
  replaceExisting?: boolean;
  accounts?: PlanAccount[];
  planned: PlanItem[];
}

export interface PlanImportSummary {
  created: number;
  removed: number;
  skipped: number;
  accountsCreated: number;
  accountsUpdated: number;
  unresolvedCategories: string[];
  unresolvedAccounts: string[];
}

// ---- session ----------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  createdAt: string;
  /** Read from the service's configured admin list, never from a column. */
  isAdmin: boolean;
}

export type { AppSettings };

/** The shape every failed request answers with. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
