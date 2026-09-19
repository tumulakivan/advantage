import {
  buildBreakdown,
  buildCashflowSeries,
  buildOutlook,
  computeKpis,
  monthRange,
  todayIso,
  type BreakdownResult,
  type CashflowPoint,
  type Granularity,
  type IsoDate,
  type Kpis,
  type MonthKey,
  type Outlook,
  type OutlookEntry,
} from "@advantage/core";
import {
  listAccounts,
  listBudgetsForMonth,
  listCategoryOptions,
  listCategoryTree,
  listIncomeSources,
  listPlanned,
  listTransactions,
  listUpcoming,
  loadWallet,
  outlookEntries,
  incomeBySource,
  largestExpenses,
  monthTotals,
  monthlyTotals,
  netWorth,
  spendByGroup,
  type AccountWithBalance,
  type BudgetRow,
  type CategoryNode,
  type CategoryOption,
  type IncomeSource,
  type LargestExpense,
  type PlannedRow,
  type SourceTotal,
  type TransactionFilters,
  type TransactionRow,
  type Wallet,
} from "@advantage/db";

import { useLiveQuery, type QueryResult } from "./useLiveQuery";

/**
 * One hook per question the UI asks. Each is a thin wrapper over a SQL query in
 * @advantage/db, so a screen never assembles a query itself and every read
 * re-runs automatically after a write.
 */

const NO_ACCOUNTS: AccountWithBalance[] = [];
const NO_CATEGORIES: CategoryNode[] = [];
const NO_OPTIONS: CategoryOption[] = [];
const NO_SOURCES: IncomeSource[] = [];
const NO_TRANSACTIONS: TransactionRow[] = [];
const NO_BUDGETS: BudgetRow[] = [];
const NO_PLANNED: PlannedRow[] = [];
const NO_SOURCE_TOTALS: SourceTotal[] = [];
const NO_LARGEST: LargestExpense[] = [];

export function useAccounts(includeArchived = false): QueryResult<AccountWithBalance[]> {
  return useLiveQuery(
    (db) => listAccounts(db, { includeArchived }),
    [includeArchived],
    NO_ACCOUNTS,
  );
}

export function useCategoryTree(kind: "expense" | "income"): QueryResult<CategoryNode[]> {
  return useLiveQuery((db) => listCategoryTree(db, { kind }), [kind], NO_CATEGORIES);
}

export function useCategoryOptions(kind: "expense" | "income"): QueryResult<CategoryOption[]> {
  return useLiveQuery((db) => listCategoryOptions(db, kind), [kind], NO_OPTIONS);
}

export function useIncomeSources(): QueryResult<IncomeSource[]> {
  return useLiveQuery((db) => listIncomeSources(db), [], NO_SOURCES);
}

export function useTransactions(filters: TransactionFilters): QueryResult<TransactionRow[]> {
  const key = JSON.stringify(filters);
  return useLiveQuery((db) => listTransactions(db, filters), [key], NO_TRANSACTIONS);
}

export function useBudgets(month: MonthKey): QueryResult<BudgetRow[]> {
  return useLiveQuery((db) => listBudgetsForMonth(db, month), [month], NO_BUDGETS);
}

export function usePlanned(includeInactive = false): QueryResult<PlannedRow[]> {
  return useLiveQuery(
    (db) => listPlanned(db, { includeInactive }),
    [includeInactive],
    NO_PLANNED,
  );
}

export function useUpcoming(days = 30): QueryResult<PlannedRow[]> {
  return useLiveQuery((db) => listUpcoming(db, days), [days], NO_PLANNED);
}

export interface DashboardData {
  kpis: Kpis;
  cashflow: CashflowPoint[];
  breakdown: BreakdownResult;
  sources: SourceTotal[];
  largest: LargestExpense[];
  netWorthMinor: number;
}

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
  sources: NO_SOURCE_TOTALS,
  largest: NO_LARGEST,
  netWorthMinor: 0,
};

/** Everything the dashboard renders, in one round trip per month change. */
export function useDashboard(month: MonthKey, locale: string): QueryResult<DashboardData> {
  return useLiveQuery(
    async (db) => {
      const months = monthRange(month, 6);
      const previousMonth = months.at(-2) ?? month;

      const [current, previous, series, groups, sources, largest, worth] = await Promise.all([
        monthTotals(db, month),
        monthTotals(db, previousMonth),
        monthlyTotals(db, months[0] ?? month, month),
        spendByGroup(db, month),
        incomeBySource(db, month),
        largestExpenses(db, month, 5),
        netWorth(db),
      ]);

      return {
        kpis: computeKpis(current, previous),
        cashflow: buildCashflowSeries(series, months, locale),
        breakdown: buildBreakdown(groups),
        sources,
        largest,
        netWorthMinor: worth,
      };
    },
    [month, locale],
    EMPTY_DASHBOARD,
  );
}

export interface OutlookData {
  outlook: Outlook;
  entries: OutlookEntry[];
}

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
    async (db) => {
      const entries = await outlookEntries(db, from, to);
      return {
        entries,
        outlook: buildOutlook(entries, from, to, { locale, granularity, today: todayIso() }),
      };
    },
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
    (db) => loadWallet(db, month, { includeArchived }),
    [month, includeArchived],
    EMPTY_WALLET,
  );
}
