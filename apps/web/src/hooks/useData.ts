import {
  listAccounts,
  listBudgetsForMonth,
  listCategoryOptions,
  listCategoryTree,
  listIncomeSources,
  listPlanned,
  listTransactions,
  listUpcoming,
  loadDashboard,
  loadOutlook,
  loadWallet,
  type AccountWithBalance,
  type BudgetRow,
  type CategoryNode,
  type CategoryOption,
  type DashboardData,
  type IncomeSource,
  type OutlookData,
  type PlannedRow,
  type TransactionFilters,
  type TransactionRow,
  type Wallet,
} from "@advantage/api-client";
import type { Granularity, IsoDate, MonthKey } from "@advantage/core";

import { useLiveQuery, type QueryResult } from "./useLiveQuery";

/**
 * One hook per question the UI asks. Each is a thin wrapper over an endpoint,
 * so a screen never assembles a request itself and every read re-runs
 * automatically after a write.
 *
 * The dashboard and outlook hooks used to do their own fan-out here - seven
 * queries under a `Promise.all` - because seven local reads cost nothing. That
 * arithmetic moved to the server; what is left is one request each.
 */

const NO_ACCOUNTS: AccountWithBalance[] = [];
const NO_CATEGORIES: CategoryNode[] = [];
const NO_OPTIONS: CategoryOption[] = [];
const NO_SOURCES: IncomeSource[] = [];
const NO_TRANSACTIONS: TransactionRow[] = [];
const NO_BUDGETS: BudgetRow[] = [];
const NO_PLANNED: PlannedRow[] = [];

export function useAccounts(includeArchived = false): QueryResult<AccountWithBalance[]> {
  return useLiveQuery(
    (api) => listAccounts(api, { includeArchived }),
    [includeArchived],
    NO_ACCOUNTS,
  );
}

export function useCategoryTree(kind: "expense" | "income"): QueryResult<CategoryNode[]> {
  return useLiveQuery((api) => listCategoryTree(api, { kind }), [kind], NO_CATEGORIES);
}

export function useCategoryOptions(kind: "expense" | "income"): QueryResult<CategoryOption[]> {
  return useLiveQuery((api) => listCategoryOptions(api, kind), [kind], NO_OPTIONS);
}

export function useIncomeSources(): QueryResult<IncomeSource[]> {
  return useLiveQuery((api) => listIncomeSources(api), [], NO_SOURCES);
}

export function useTransactions(filters: TransactionFilters): QueryResult<TransactionRow[]> {
  const key = JSON.stringify(filters);
  return useLiveQuery(
    (api, signal) => listTransactions(api, filters, signal),
    [key],
    NO_TRANSACTIONS,
  );
}

export function useBudgets(month: MonthKey): QueryResult<BudgetRow[]> {
  return useLiveQuery((api) => listBudgetsForMonth(api, month), [month], NO_BUDGETS);
}

export function usePlanned(includeInactive = false): QueryResult<PlannedRow[]> {
  return useLiveQuery(
    (api) => listPlanned(api, { includeInactive }),
    [includeInactive],
    NO_PLANNED,
  );
}

export function useUpcoming(days = 30): QueryResult<PlannedRow[]> {
  return useLiveQuery((api) => listUpcoming(api, days), [days], NO_PLANNED);
}

export type { DashboardData };

const EMPTY_DASHBOARD: DashboardData = {
  kpis: {
    incomeMinor: 0,
    expenseMinor: 0,
    netMinor: 0,
    savingsRate: 0,
    incomeDelta: null,
    expenseDelta: null,
    netDelta: null,
  },
  cashflow: [],
  breakdown: { slices: [], totalMinor: 0, foldedCount: 0 },
  sources: [],
  largest: [],
  netWorthMinor: 0,
};

/** Everything the dashboard renders, in one round trip per month change. */
export function useDashboard(month: MonthKey, locale: string): QueryResult<DashboardData> {
  return useLiveQuery(
    (api, signal) => loadDashboard(api, month, locale, signal),
    [month, locale],
    EMPTY_DASHBOARD,
  );
}

export type { OutlookData };

const EMPTY_OUTLOOK: OutlookData = {
  entries: [],
  outlook: {
    buckets: [],
    granularity: "month",
    todayBucket: null,
    totals: {
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      loggedNetMinor: 0,
      plannedNetMinor: 0,
      plannedCount: 0,
      loggedCount: 0,
    },
  },
};

/**
 * The forward view: logged records and the schedule occurrences that have not
 * happened yet, over any window. The bucket size follows the span unless the
 * caller pins it.
 */
export function useOutlook(
  from: IsoDate,
  to: IsoDate,
  locale: string,
  granularity?: Granularity,
): QueryResult<OutlookData> {
  return useLiveQuery(
    (api, signal) => loadOutlook(api, from, to, locale, granularity, signal),
    [from, to, locale, granularity],
    EMPTY_OUTLOOK,
  );
}

const EMPTY_WALLET: Wallet = {
  accounts: [],
  totals: {
    balanceMinor: 0,
    spentMinor: 0,
    receivedMinor: 0,
    monthCount: 0,
    accountCount: 0,
  },
};

/** Balances for every account, plus what moved through each one this month. */
export function useWallet(month: MonthKey, includeArchived = false): QueryResult<Wallet> {
  return useLiveQuery(
    (api) => loadWallet(api, month, { includeArchived }),
    [month, includeArchived],
    EMPTY_WALLET,
  );
}
