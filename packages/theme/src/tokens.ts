/**
 * Token accessors for code that has to hand a color to a chart library.
 *
 * Everything resolves to a `var(--token)` string rather than a hex literal, so
 * SVG marks re-paint themselves when the theme flips - no re-render, no
 * duplicated palette, one source of truth in `theme.css`.
 */

/** Fixed categorical order. Never cycled: a slot past the last one folds into `other`. */
export const CHART_SLOTS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
] as const;

export type ChartSlot = (typeof CHART_SLOTS)[number];

export function isChartSlot(value: string): value is ChartSlot {
  return (CHART_SLOTS as readonly string[]).includes(value);
}

/** `"chart-3"` -> `"var(--chart-3)"`. Unknown names fall back to the neutral. */
export function slotColor(slot: string | null | undefined): string {
  if (!slot || !isChartSlot(slot)) return "var(--chart-other)";
  return `var(--${slot})`;
}

export const SERIES = {
  income: "var(--chart-income)",
  incomeEmphasis: "var(--chart-income-emphasis)",
  expense: "var(--chart-expense)",
  net: "var(--chart-net)",
  other: "var(--chart-other)",
} as const;

export const CHART_CHROME = {
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  surface: "var(--chart-surface)",
} as const;

export type ThemeMode = "dark" | "light";
