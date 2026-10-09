import {
  addDays,
  addMonths,
  dueDateIn,
  monthKeyOf,
  monthLabel,
  parseIsoDate,
  todayIso,
  weekStart,
  type IsoDate,
  type MonthKey,
} from "./dates";
import type { Frequency, Minor } from "./types";

/**
 * Expanding schedules into dates, and folding dated money into buckets.
 *
 * All of it is pure: the outlook is the one screen that mixes what happened
 * with what is only expected, so the arithmetic deciding which is which is
 * worth being able to test without a database.
 */

const STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Hard stop so a bad anchor can never spin forever. */
const MAX_OCCURRENCES = 2000;

/**
 * Every date a schedule produces inside `[from, to]`.
 *
 * `anchor` is the first occurrence, never a phase offset, so a schedule never
 * produces a date before the day it was set up.
 */
export function occurrencesBetween(
  frequency: Frequency,
  anchor: IsoDate,
  from: IsoDate,
  to: IsoDate,
  endDate?: IsoDate | null,
): IsoDate[] {
  if (to < from) return [];
  const last = endDate && endDate < to ? endDate : to;
  if (last < anchor) return [];

  if (frequency === "once") {
    return anchor >= from && anchor <= last ? [anchor] : [];
  }

  const dates: IsoDate[] = [];

  if (frequency === "weekly") {
    let cursor = anchor;
    if (cursor < from) {
      const weeks = Math.floor(daysApart(cursor, from) / 7);
      cursor = addDays(cursor, weeks * 7);
      while (cursor < from) cursor = addDays(cursor, 7);
    }
    while (cursor <= last && dates.length < MAX_OCCURRENCES) {
      dates.push(cursor);
      cursor = addDays(cursor, 7);
    }
    return dates;
  }

  const step = STEP_MONTHS[frequency] ?? 1;
  const day = Number(anchor.slice(8, 10));
  let month: MonthKey = monthKeyOf(anchor);

  while (dates.length < MAX_OCCURRENCES) {
    const date = dueDateIn(month, day);
    if (date > last) break;
    if (date >= from && date >= anchor) dates.push(date);
    month = addMonths(month, step);
  }

  return dates;
}

function daysApart(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

// ---- buckets ----------------------------------------------------------------

export type Granularity = "day" | "week" | "month" | "year";

/** The span decides the bucket: a year of daily bars is unreadable. */
export function granularityFor(from: IsoDate, to: IsoDate): Granularity {
  const days = daysApart(from, to);
  if (days <= 62) return "day";
  if (days <= 366 * 2) return "month";
  return "year";
}

export function bucketOf(date: IsoDate, granularity: Granularity): string {
  if (granularity === "day") return date;
  // A week is keyed by its Monday, so the key still sorts and parses as a date.
  if (granularity === "week") return weekStart(date);
  if (granularity === "month") return date.slice(0, 7);
  return date.slice(0, 4);
}

/** Ordered bucket keys covering the window, so the axis has no holes. */
export function bucketsBetween(from: IsoDate, to: IsoDate, granularity: Granularity): string[] {
  const keys: string[] = [];

  if (granularity === "day") {
    let cursor = from;
    while (cursor <= to && keys.length < MAX_OCCURRENCES) {
      keys.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return keys;
  }

  if (granularity === "week") {
    let cursor = weekStart(from);
    while (cursor <= to && keys.length < MAX_OCCURRENCES) {
      keys.push(cursor);
      cursor = addDays(cursor, 7);
    }
    return keys;
  }

  if (granularity === "month") {
    let cursor = monthKeyOf(from);
    const end = monthKeyOf(to);
    while (cursor <= end && keys.length < MAX_OCCURRENCES) {
      keys.push(cursor);
      cursor = addMonths(cursor, 1);
    }
    return keys;
  }

  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) {
    keys.push(String(year));
  }
  return keys;
}

export function bucketLabel(key: string, granularity: Granularity, locale?: string): string {
  if (granularity === "year") return key;
  if (granularity === "month") return monthLabel(key, locale);
  // Day and week both read as a date: a week is labelled by the Monday it starts on.
  return new Intl.DateTimeFormat(locale ?? "en-PH", { month: "short", day: "numeric" }).format(
    parseIsoDate(key),
  );
}

// ---- the outlook ------------------------------------------------------------

/** One dated movement: either a record that exists, or a scheduled occurrence. */
export interface OutlookEntry {
  /** Stable within a render - `${sourceId}:${date}` for planned occurrences. */
  id: string;
  date: IsoDate;
  /** `logged` already happened; `planned` is still only expected. */
  kind: "logged" | "planned";
  direction: "income" | "expense";
  amountMinor: Minor;
  label: string;
  detail: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string | null;
  /** The source's chart slot, so an income row is marked without a logo. */
  sourceColor: string | null;
}

export interface OutlookBucket {
  key: string;
  label: string;
  incomeMinor: Minor;
  expenseMinor: Minor;
  /** Negative, for a bar below the baseline. */
  expenseSignedMinor: Minor;
  netMinor: Minor;
  /** Total balance at the close of the bucket: the line the chart follows. */
  balanceMinor: Minor;
  plannedShare: number;
  hasEntries: boolean;
  entryCount: number;
}

export interface OutlookTotals {
  incomeMinor: Minor;
  expenseMinor: Minor;
  netMinor: Minor;
  loggedNetMinor: Minor;
  plannedNetMinor: Minor;
  plannedCount: number;
  loggedCount: number;
  /** Total balance going into the window. */
  openingBalanceMinor: Minor;
  /** Total balance once everything in the window, logged or planned, lands. */
  closingBalanceMinor: Minor;
  /**
   * The real balance as of today - records only - when today falls in the
   * window. A bucket's line point is its close, so the bucket holding today
   * would otherwise only ever show where the week or month ends up.
   */
  todayBalanceMinor: Minor | null;
}

/** One dated change to the total balance, signed. */
export interface BalanceMove {
  date: IsoDate;
  deltaMinor: Minor;
}

/**
 * Where the balance line starts and what has really moved it.
 *
 * Logged moves are passed apart from the entries because more moves a balance
 * than income and spending: a Set balance adjustment does, and so does a
 * transfer into or out of an account left out of totals. Planned entries still
 * come from `entries`, since only they say what is yet to land.
 */
export interface BalanceBasis {
  openingMinor: Minor;
  loggedMoves: readonly BalanceMove[];
}

export interface Outlook {
  buckets: OutlookBucket[];
  totals: OutlookTotals;
  granularity: Granularity;
  /** The bucket holding today, when the window covers it. */
  todayBucket: string | null;
}

export function buildOutlook(
  entries: readonly OutlookEntry[],
  from: IsoDate,
  to: IsoDate,
  options: {
    locale?: string;
    granularity?: Granularity;
    today?: IsoDate;
    /** Without one the line starts at zero and follows the entries alone. */
    balance?: BalanceBasis;
  } = {},
): Outlook {
  const granularity = options.granularity ?? granularityFor(from, to);
  const keys = bucketsBetween(from, to, granularity);
  const today = options.today ?? todayIso();

  const empty = () => ({ income: 0, expense: 0, planned: 0, count: 0, moved: 0 });
  const tally = new Map<string, ReturnType<typeof empty>>();
  for (const key of keys) tally.set(key, empty());

  const totals: OutlookTotals = {
    incomeMinor: 0,
    expenseMinor: 0,
    netMinor: 0,
    loggedNetMinor: 0,
    plannedNetMinor: 0,
    plannedCount: 0,
    loggedCount: 0,
    openingBalanceMinor: options.balance?.openingMinor ?? 0,
    closingBalanceMinor: 0,
    todayBalanceMinor: null,
  };
  let loggedToToday = 0;

  for (const entry of entries) {
    const bucket = tally.get(bucketOf(entry.date, granularity));
    if (!bucket) continue;

    const signed = entry.direction === "income" ? entry.amountMinor : -entry.amountMinor;

    if (entry.direction === "income") {
      bucket.income += entry.amountMinor;
      totals.incomeMinor += entry.amountMinor;
    } else {
      bucket.expense += entry.amountMinor;
      totals.expenseMinor += entry.amountMinor;
    }

    bucket.count += 1;
    if (entry.kind === "planned") {
      bucket.moved += signed;
      bucket.planned += entry.amountMinor;
      totals.plannedNetMinor += signed;
      totals.plannedCount += 1;
    } else {
      if (!options.balance) {
        bucket.moved += signed;
        if (entry.date <= today) loggedToToday += signed;
      }
      totals.loggedNetMinor += signed;
      totals.loggedCount += 1;
    }
  }

  for (const move of options.balance?.loggedMoves ?? []) {
    const bucket = tally.get(bucketOf(move.date, granularity));
    if (!bucket) continue;
    bucket.moved += move.deltaMinor;
    if (move.date <= today) loggedToToday += move.deltaMinor;
  }

  totals.netMinor = totals.incomeMinor - totals.expenseMinor;

  let balance = totals.openingBalanceMinor;
  const buckets: OutlookBucket[] = keys.map((key) => {
    const row = tally.get(key) ?? empty();
    const netMinor = row.income - row.expense;
    const moved = row.income + row.expense;
    balance += row.moved;

    return {
      key,
      label: bucketLabel(key, granularity, options.locale),
      incomeMinor: row.income,
      expenseMinor: row.expense,
      expenseSignedMinor: -row.expense,
      netMinor,
      balanceMinor: balance,
      plannedShare: moved === 0 ? 0 : row.planned / moved,
      hasEntries: row.count > 0,
      entryCount: row.count,
    };
  });

  totals.closingBalanceMinor = balance;
  const todayKey = bucketOf(today, granularity);
  if (keys.includes(todayKey)) {
    totals.todayBalanceMinor = totals.openingBalanceMinor + loggedToToday;
  }

  return {
    buckets,
    totals,
    granularity,
    todayBucket: keys.includes(todayKey) ? todayKey : null,
  };
}
