import type { Minor, MoneyFormatOptions } from "./types";

/**
 * Money is stored as an integer number of minor units. Every conversion in and
 * out of that representation goes through this file - float arithmetic on pesos
 * is the easiest way to lose a centavo per row and never notice.
 */

const DEFAULTS = { currency: "PHP", locale: "en-PH" } as const;

export function toMinor(major: number): Minor {
  if (!Number.isFinite(major)) return 0;
  return Math.round(major * 100);
}

export function toMajor(minor: Minor): number {
  return minor / 100;
}

/**
 * Parse whatever a human typed into an amount field: "1,234.5", "P1500",
 * "-2 500.75", "50000". Returns null when there is no number in there at all,
 * so the caller can tell "empty" from "zero".
 */
export function parseAmount(input: string): Minor | null {
  const cleaned = input.replace(/[^0-9.,-]/g, "").trim();
  if (!cleaned) return null;

  const negative = cleaned.startsWith("-");
  let body = cleaned.replace(/-/g, "");

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");

  if (lastComma > lastDot) {
    // 1.234,56 - comma is the decimal separator
    body = body.replace(/\./g, "").replace(",", ".");
  } else {
    // 1,234.56 - comma is the thousands separator
    body = body.replace(/,/g, "");
  }

  const value = Number.parseFloat(body);
  if (!Number.isFinite(value)) return null;

  const minor = Math.round(value * 100);
  return negative ? -minor : minor;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(key: string, factory: () => Intl.NumberFormat): Intl.NumberFormat {
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const made = factory();
  formatterCache.set(key, made);
  return made;
}

export function formatMoney(minor: Minor, options: MoneyFormatOptions = {}): string {
  const {
    currency = DEFAULTS.currency,
    locale = DEFAULTS.locale,
    signed = false,
    compact = false,
    hideCents = false,
  } = options;

  const digits = hideCents || compact ? 0 : 2;
  const key = `${locale}|${currency}|${digits}|${compact}`;
  const nf = formatter(key, () =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  );

  const body = nf.format(Math.abs(toMajor(minor)));
  if (minor < 0) return `-${body}`;
  if (signed && minor > 0) return `+${body}`;
  return body;
}

/** Bare number, no currency symbol - for inputs and dense tables. */
export function formatAmount(minor: Minor, locale: string = DEFAULTS.locale): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMajor(minor));
}

export function currencySymbol(
  currency: string = DEFAULTS.currency,
  locale: string = DEFAULTS.locale,
): string {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}

/** Share of a total, guarded against divide-by-zero. 0..1, never NaN. */
export function share(part: Minor, total: Minor): number {
  if (total === 0) return 0;
  return part / total;
}

export function formatPercent(
  ratio: number,
  locale: string = DEFAULTS.locale,
  digits = 0,
): string {
  if (!Number.isFinite(ratio)) return "--";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}
