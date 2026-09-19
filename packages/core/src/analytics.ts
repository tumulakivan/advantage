import { daysInMonth, monthLabel, type MonthKey } from "./dates";
import { share } from "./money";
import type { Minor } from "./types";

/**
 * Pure derivation of everything the dashboard shows. The DB layer supplies
 * aggregate rows; this file turns them into series and verdicts, so the numbers
 * can be unit-tested without a database and a chart can never invent one.
 */

export interface MonthTotalsRow {
  month: MonthKey;
  incomeMinor: Minor;
  expenseMinor: Minor;
}

export interface CashflowPoint {
  month: MonthKey;
  label: string;
  incomeMinor: Minor;
  /** Positive magnitude. */
  expenseMinor: Minor;
  /** Negative, for a signed bar below the baseline. */
  expenseSignedMinor: Minor;
  netMinor: Minor;
  /** False when the month holds no records at all. */
  hasRecords: boolean;
  /**
   * The net, or null for a month with no records. A line through those months
   * would claim a net of zero was measured, when nothing was.
   */
  netLineMinor: Minor | null;
}

/**
 * Fill every requested month, in order, even the empty ones - a missing bar
 * reads as "no data" but a gap in the axis reads as a broken chart.
 */
export function buildCashflowSeries(
  rows: readonly MonthTotalsRow[],
  months: readonly MonthKey[],
  locale?: string,
): CashflowPoint[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));

  return months.map((month) => {
    const row = byMonth.get(month);
    const incomeMinor = row?.incomeMinor ?? 0;
    const expenseMinor = row?.expenseMinor ?? 0;
    const netMinor = incomeMinor - expenseMinor;
    const hasRecords = Boolean(row) && (incomeMinor !== 0 || expenseMinor !== 0);

    return {
      month,
      label: monthLabel(month, locale),
      incomeMinor,
      expenseMinor,
      expenseSignedMinor: -expenseMinor,
      netMinor,
      hasRecords,
      netLineMinor: hasRecords ? netMinor : null,
    };
  });
}

export interface BreakdownInput {
  key: string;
  label: string;
  /** Chart slot token owned by the entity. */
  color: string;
  amountMinor: Minor;
  icon?: string;
}

export interface BreakdownSlice extends BreakdownInput {
  share: number;
  /** True for the synthetic fold-up slice. */
  isOther: boolean;
}

export interface BreakdownResult {
  slices: BreakdownSlice[];
  totalMinor: Minor;
  /** How many real entities went into the "Other" slice. */
  foldedCount: number;
}

/**
 * Rank descending, keep at most `limit` real slices, fold the tail into a
 * single neutral "Other". Never generates a hue for slice 8.
 */
export function buildBreakdown(
  rows: readonly BreakdownInput[],
  limit = 7,
): BreakdownResult {
  const positive = rows.filter((row) => row.amountMinor > 0);
  const totalMinor = positive.reduce((sum, row) => sum + row.amountMinor, 0);
  const ranked = [...positive].sort((a, b) => b.amountMinor - a.amountMinor);

  const head = ranked.slice(0, limit);
  const tail = ranked.slice(limit);

  const slices: BreakdownSlice[] = head.map((row) => ({
    ...row,
    share: share(row.amountMinor, totalMinor),
    isOther: false,
  }));

  if (tail.length > 0) {
    const amountMinor = tail.reduce((sum, row) => sum + row.amountMinor, 0);
    slices.push({
      key: "__other__",
      label: "Other",
      color: "chart-other",
      amountMinor,
      share: share(amountMinor, totalMinor),
      isOther: true,
    });
  }

  return { slices, totalMinor, foldedCount: tail.length };
}

/** Percentage change, or null when there is no baseline to compare against. */
export function deltaRatio(current: Minor, previous: Minor): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export interface Kpis {
  incomeMinor: Minor;
  expenseMinor: Minor;
  netMinor: Minor;
  /** Net as a share of income, 0..1. Negative when overspending. */
  savingsRate: number;
  incomeDelta: number | null;
  expenseDelta: number | null;
  netDelta: number | null;
}

export function computeKpis(current: MonthTotalsRow, previous?: MonthTotalsRow): Kpis {
  const netMinor = current.incomeMinor - current.expenseMinor;
  const previousNet = previous ? previous.incomeMinor - previous.expenseMinor : 0;

  return {
    incomeMinor: current.incomeMinor,
    expenseMinor: current.expenseMinor,
    netMinor,
    savingsRate: share(netMinor, current.incomeMinor),
    incomeDelta: previous ? deltaRatio(current.incomeMinor, previous.incomeMinor) : null,
    expenseDelta: previous ? deltaRatio(current.expenseMinor, previous.expenseMinor) : null,
    netDelta: previous ? deltaRatio(netMinor, previousNet) : null,
  };
}

export type BudgetState = "ok" | "warning" | "over";

export interface BudgetVerdict {
  spentMinor: Minor;
  limitMinor: Minor;
  remainingMinor: Minor;
  /** Spent / limit, uncapped so the bar can show 140%. */
  ratio: number;
  state: BudgetState;
  /** Linear run-rate projection for the whole month. */
  projectedMinor: Minor;
  /** True when the run-rate lands over the limit before month end. */
  offPace: boolean;
}

/**
 * A budget verdict is two judgements, not one: where the total stands, and
 * whether the pace gets there early. "70% spent" is calm on day 28 and an
 * alarm on day 8.
 */
export function budgetVerdict(
  spentMinor: Minor,
  limitMinor: Minor,
  month: MonthKey,
  today = new Date(),
): BudgetVerdict {
  const total = daysInMonth(month);
  const elapsed = clamp(dayOfMonthWithin(month, today), 1, total);
  const ratio = limitMinor > 0 ? spentMinor / limitMinor : 0;
  const projectedMinor = Math.round((spentMinor / elapsed) * total);

  const state: BudgetState = ratio >= 1 ? "over" : ratio >= 0.8 ? "warning" : "ok";

  return {
    spentMinor,
    limitMinor,
    remainingMinor: limitMinor - spentMinor,
    ratio,
    state,
    projectedMinor,
    offPace: state !== "over" && limitMinor > 0 && projectedMinor > limitMinor,
  };
}

function dayOfMonthWithin(month: MonthKey, today: Date): number {
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  if (key === month) return today.getDate();
  // A past month is fully elapsed; a future month has barely started.
  return key > month ? daysInMonth(month) : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
