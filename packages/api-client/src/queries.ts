import type {
  AccountInput,
  AccountPatch,
  AccountWithBalance,
  AddFromCatalogInput,
  AdminMetrics,
  AppSettings,
  BackupPayload,
  BudgetInput,
  CatalogEntry,
  CatalogEntryInput,
  CatalogEntryPatch,
  BudgetRow,
  Category,
  CategoryInput,
  CategoryNode,
  CategoryOption,
  CategoryPatch,
  DashboardData,
  DatabaseStats,
  ImportSummary,
  IncomeSource,
  IncomeSourceInput,
  IncomeSourcePatch,
  OutlookData,
  PlanImportSummary,
  PlannedInput,
  PlannedPatch,
  PlannedRow,
  SessionUser,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionPatch,
  TransactionRow,
  Wallet,
} from "./types";
import type { CategoryKind, Granularity, IsoDate, MonthKey } from "@advantage/core";

import type { ApiClient } from "./client";

/**
 * One function per question the app asks, named exactly as the SQLite query
 * layer named it and taking a handle as its first argument exactly as that did.
 *
 * That symmetry is the point. The screens went from `listAccounts(db, ...)` to
 * `listAccounts(api, ...)` and otherwise did not change, which is what made it
 * possible to move the whole data layer onto a server without rewriting the
 * six thousand lines sitting on top of it.
 */

// ---- accounts ---------------------------------------------------------------

export function listAccounts(
  api: ApiClient,
  options: { includeArchived?: boolean } = {},
): Promise<AccountWithBalance[]> {
  return api.get("/api/accounts", { includeArchived: options.includeArchived ?? false });
}

export async function createAccount(api: ApiClient, input: AccountInput): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/accounts", input);
  return id;
}

export function updateAccount(api: ApiClient, id: string, patch: AccountPatch): Promise<void> {
  return api.patch(`/api/accounts/${id}`, patch);
}

export function archiveAccount(api: ApiClient, id: string): Promise<void> {
  return api.post(`/api/accounts/${id}/archive`);
}

export function restoreAccount(api: ApiClient, id: string): Promise<void> {
  return api.post(`/api/accounts/${id}/restore`);
}

// ---- categories -------------------------------------------------------------

export function listCategories(
  api: ApiClient,
  options: { kind?: CategoryKind; includeArchived?: boolean } = {},
): Promise<Category[]> {
  return api.get("/api/categories", {
    kind: options.kind,
    includeArchived: options.includeArchived ?? false,
  });
}

export function listCategoryTree(
  api: ApiClient,
  options: { kind?: CategoryKind } = {},
): Promise<CategoryNode[]> {
  return api.get("/api/categories/tree", { kind: options.kind });
}

export function listCategoryOptions(
  api: ApiClient,
  kind: CategoryKind,
): Promise<CategoryOption[]> {
  return api.get("/api/categories/options", { kind });
}

export async function createCategory(api: ApiClient, input: CategoryInput): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/categories", input);
  return id;
}

export function updateCategory(api: ApiClient, id: string, patch: CategoryPatch): Promise<void> {
  return api.patch(`/api/categories/${id}`, patch);
}

export function archiveCategory(api: ApiClient, id: string): Promise<void> {
  return api.post(`/api/categories/${id}/archive`);
}

// ---- transactions -----------------------------------------------------------

export function listTransactions(
  api: ApiClient,
  filters: TransactionFilters = {},
  signal?: AbortSignal,
): Promise<TransactionRow[]> {
  return api.get(
    "/api/transactions",
    {
      types: filters.types?.length ? filters.types.join(",") : undefined,
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      incomeSourceId: filters.incomeSourceId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      search: filters.search,
      limit: filters.limit,
      offset: filters.offset,
    },
    signal,
  );
}

export function getTransaction(api: ApiClient, id: string): Promise<Transaction> {
  return api.get(`/api/transactions/${id}`);
}

export async function createTransaction(
  api: ApiClient,
  input: TransactionInput,
): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/transactions", input);
  return id;
}

export function updateTransaction(
  api: ApiClient,
  id: string,
  patch: TransactionPatch,
): Promise<void> {
  return api.patch(`/api/transactions/${id}`, patch);
}

export function deleteTransaction(api: ApiClient, id: string): Promise<void> {
  return api.delete(`/api/transactions/${id}`);
}

// ---- budgets ----------------------------------------------------------------

export function listBudgetsForMonth(api: ApiClient, month: MonthKey): Promise<BudgetRow[]> {
  return api.get("/api/budgets", { month });
}

export async function upsertBudget(api: ApiClient, input: BudgetInput): Promise<string> {
  const { id } = await api.put<{ id: string }>("/api/budgets", input);
  return id;
}

export function deleteBudget(api: ApiClient, id: string): Promise<void> {
  return api.delete(`/api/budgets/${id}`);
}

// ---- planned payments -------------------------------------------------------

export function listPlanned(
  api: ApiClient,
  options: { includeInactive?: boolean } = {},
): Promise<PlannedRow[]> {
  return api.get("/api/planned", { includeInactive: options.includeInactive ?? false });
}

export function listUpcoming(api: ApiClient, days = 30): Promise<PlannedRow[]> {
  return api.get("/api/planned/upcoming", { days });
}

export async function createPlanned(api: ApiClient, input: PlannedInput): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/planned", input);
  return id;
}

export function updatePlanned(api: ApiClient, id: string, patch: PlannedPatch): Promise<void> {
  return api.patch(`/api/planned/${id}`, patch);
}

export function deletePlanned(api: ApiClient, id: string): Promise<void> {
  return api.delete(`/api/planned/${id}`);
}

export async function postPlanned(
  api: ApiClient,
  id: string,
  overrides: { date?: IsoDate; amountMinor?: number } = {},
): Promise<string> {
  const result = await api.post<{ id: string }>(`/api/planned/${id}/post`, overrides);
  return result.id;
}

export function unpostPlanned(api: ApiClient, id: string): Promise<void> {
  return api.post(`/api/planned/${id}/unpost`);
}

// ---- whole screens ----------------------------------------------------------

export function loadDashboard(
  api: ApiClient,
  month: MonthKey,
  locale: string,
  signal?: AbortSignal,
): Promise<DashboardData> {
  return api.get("/api/dashboard", { month, locale }, signal);
}

export function loadOutlook(
  api: ApiClient,
  from: IsoDate,
  to: IsoDate,
  locale: string,
  granularity?: Granularity,
  signal?: AbortSignal,
): Promise<OutlookData> {
  return api.get("/api/outlook", { from, to, locale, granularity }, signal);
}

export function loadWallet(
  api: ApiClient,
  month: MonthKey,
  options: { includeArchived?: boolean } = {},
): Promise<Wallet> {
  return api.get("/api/wallet", {
    month,
    includeArchived: options.includeArchived ?? false,
  });
}

// ---- settings and income sources --------------------------------------------

export function readSettings(api: ApiClient): Promise<AppSettings> {
  return api.get("/api/settings");
}

export function writeSettings(api: ApiClient, patch: Partial<AppSettings>): Promise<AppSettings> {
  return api.patch("/api/settings", patch);
}

export function listIncomeSources(api: ApiClient): Promise<IncomeSource[]> {
  return api.get("/api/income-sources");
}

export async function createIncomeSource(
  api: ApiClient,
  input: IncomeSourceInput,
): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/income-sources", input);
  return id;
}

export function updateIncomeSource(
  api: ApiClient,
  id: string,
  patch: IncomeSourcePatch,
): Promise<void> {
  return api.patch(`/api/income-sources/${id}`, patch);
}

export function archiveIncomeSource(api: ApiClient, id: string): Promise<void> {
  return api.post(`/api/income-sources/${id}/archive`);
}

export function restoreIncomeSource(api: ApiClient, id: string): Promise<void> {
  return api.post(`/api/income-sources/${id}/restore`);
}

// ---- the shared account catalog ---------------------------------------------

/** What a user can add to their wallet. */
export function listCatalog(api: ApiClient): Promise<CatalogEntry[]> {
  return api.get("/api/catalog");
}

export async function addAccountFromCatalog(
  api: ApiClient,
  input: AddFromCatalogInput,
): Promise<string> {
  const { id } = await api.post<{ id: string }>("/api/accounts/from-catalog", input);
  return id;
}

// ---- admin ------------------------------------------------------------------

export function loadAdminMetrics(api: ApiClient, signal?: AbortSignal): Promise<AdminMetrics> {
  return api.get("/api/admin/metrics", undefined, signal);
}

/** The admin view, which unlike the public one includes archived entries. */
export function listCatalogForAdmin(api: ApiClient): Promise<CatalogEntry[]> {
  return api.get("/api/admin/catalog");
}

export function createCatalogEntry(
  api: ApiClient,
  input: CatalogEntryInput,
): Promise<CatalogEntry> {
  return api.post("/api/admin/catalog", input);
}

export function updateCatalogEntry(
  api: ApiClient,
  id: string,
  patch: CatalogEntryPatch,
): Promise<CatalogEntry> {
  return api.patch(`/api/admin/catalog/${id}`, patch);
}

export function archiveCatalogEntry(
  api: ApiClient,
  id: string,
  archived: boolean,
): Promise<CatalogEntry> {
  return api.post(`/api/admin/catalog/${id}/archive`, { archived });
}

export function databaseStats(api: ApiClient): Promise<DatabaseStats> {
  return api.get("/api/stats");
}

// ---- data in and out ---------------------------------------------------------

export function exportBackup(api: ApiClient): Promise<BackupPayload> {
  return api.get("/api/backup");
}

export function importBackup(api: ApiClient, payload: unknown): Promise<void> {
  return api.post("/api/import/backup", payload);
}

export function importRecords(api: ApiClient, payload: unknown): Promise<ImportSummary> {
  return api.post("/api/import/records", payload);
}

export function importPlan(api: ApiClient, payload: unknown): Promise<PlanImportSummary> {
  return api.post("/api/import/plan", payload);
}

/** Erase the ledger. The server seeds a fresh one on the next read. */
export function resetLedger(api: ApiClient): Promise<void> {
  return api.post("/api/reset");
}

// ---- the person -------------------------------------------------------------

export function getMe(api: ApiClient): Promise<SessionUser> {
  return api.get("/api/me");
}

export function deleteMyAccount(api: ApiClient): Promise<void> {
  return api.delete("/api/me");
}
