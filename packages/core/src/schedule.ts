import {
  addDays,
  addMonths,
  dueDateIn,
  monthKeyOf,
  monthLabel,
  parseIsoDate,
  todayIso,
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

export type Granularity = "day" | "month" | "year";

/** The span decides the bucket: a year of daily bars is unreadable. */
export function granularityFor(from: IsoDate, to: IsoDate): Granularity {
  const days = daysApart(from, to);
  if (days <= 62) return "day";
  if (days <= 366 * 2) return "month";
  return "year";
}

export function bucketOf(date: IsoDate, granularity: Granularity): string {
  if (granularity === "day") return date;
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
  netLineMinor: Minor | null;
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
  options: { locale?: string; granularity?: Granularity; today?: IsoDate } = {},
): Outlook {
  const granularity = options.granularity ?? granularityFor(from, to);
  const keys = bucketsBetween(from, to, granularity);
  const today = options.today ?? todayIso();

  const empty = () => ({ income: 0, expense: 0, planned: 0, count: 0 });
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
  };

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
      bucket.planned += entry.amountMinor;
      totals.plannedNetMinor += signed;
      totals.plannedCount += 1;
    } else {
      totals.loggedNetMinor += signed;
      totals.loggedCount += 1;
    }
  }

  totals.netMinor = totals.incomeMinor - totals.expenseMinor;

  const buckets: OutlookBucket[] = keys.map((key) => {
    const row = tally.get(key) ?? empty();
    const netMinor = row.income - row.expense;
    const moved = row.income + row.expense;

    return {
      key,
      label: bucketLabel(key, granularity, options.locale),
      incomeMinor: row.income,
      expenseMinor: row.expense,
      expenseSignedMinor: -row.expense,
      netMinor,
      // A line through an empty bucket would claim a net that was never measured.
      netLineMinor: row.count > 0 ? netMinor : null,
      plannedShare: moved === 0 ? 0 : row.planned / moved,
      hasEntries: row.count > 0,
      entryCount: row.count,
    };
  });

  const todayKey = bucketOf(today, granularity);

  return {
    buckets,
    totals,
    granularity,
    todayBucket: keys.includes(todayKey) ? todayKey : null,
  };
}
