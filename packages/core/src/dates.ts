/**
 * Dates are stored as `YYYY-MM-DD` strings and months as `YYYY-MM` keys. No
 * Date objects in the database, so a record saved at 11pm never drifts into the
 * previous month on someone else's timezone.
 */

export type IsoDate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const pad = (value: number) => String(value).padStart(2, "0");

export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(): IsoDate {
  return toIsoDate(new Date());
}

export function parseIsoDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function monthKeyOf(iso: IsoDate): MonthKey {
  return iso.slice(0, 7);
}

export function currentMonthKey(): MonthKey {
  return monthKeyOf(todayIso());
}

export function monthStart(month: MonthKey): IsoDate {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): IsoDate {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(year ?? 1970, m ?? 1, 0).getDate();
  return `${month}-${pad(last)}`;
}

export function daysInMonth(month: MonthKey): number {
  const [year, m] = month.split("-").map(Number);
  return new Date(year ?? 1970, m ?? 1, 0).getDate();
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year ?? 1970, (m ?? 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function addDays(iso: IsoDate, delta: number): IsoDate {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

/** Inclusive list of month keys, oldest first. */
export function monthRange(endMonth: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(endMonth, i - (count - 1)));
}

export function monthLabel(
  month: MonthKey,
  locale = "en-PH",
  style: "short" | "long" = "short",
): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year ?? 1970, (m ?? 1) - 1, 1);
  return new Intl.DateTimeFormat(locale, {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
  }).format(date);
}

export function dateLabel(iso: IsoDate, locale = "en-PH"): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    parseIsoDate(iso),
  );
}

export function fullDateLabel(iso: IsoDate, locale = "en-PH"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseIsoDate(iso));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** "Today", "Tomorrow", "in 6 days", "3 days ago". */
export function relativeDayLabel(iso: IsoDate, from: IsoDate = todayIso()): string {
  const delta = daysBetween(from, iso);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta > 0) return `in ${delta} days`;
  return `${Math.abs(delta)} days ago`;
}

/** Clamp a recurring due-day (e.g. 31) into a month that is shorter. */
export function dueDateIn(month: MonthKey, dueDay: number): IsoDate {
  const clamped = Math.min(Math.max(dueDay, 1), daysInMonth(month));
  return `${month}-${pad(clamped)}`;
}

const STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Next occurrence on or after `from`. A `once` schedule returns null once past. */
export function nextOccurrence(
  frequency: "weekly" | "monthly" | "quarterly" | "yearly" | "once",
  anchor: IsoDate,
  from: IsoDate = todayIso(),
): IsoDate | null {
  if (frequency === "once") return anchor >= from ? anchor : null;

  if (frequency === "weekly") {
    let next = anchor;
    while (next < from) next = addDays(next, 7);
    return next;
  }

  const step = STEP_MONTHS[frequency] ?? 1;
  const day = Number(anchor.slice(8, 10));
  let month = monthKeyOf(anchor);
  let next = dueDateIn(month, day);
  while (next < from) {
    month = addMonths(month, step);
    next = dueDateIn(month, day);
  }
  return next;
}
