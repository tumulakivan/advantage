import { CHART_CHROME } from "@advantage/theme";

/**
 * Shared chart chrome. Recessive grid, muted axis ink, no drop shadows, and
 * tick labels that stay short enough not to collide - the axis is scaffolding,
 * the marks are the content.
 */
export const AXIS = {
  stroke: CHART_CHROME.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID = {
  stroke: CHART_CHROME.grid,
  strokeDasharray: "2 4",
  vertical: false,
} as const;

export const CURSOR_FILL = "rgb(255 255 255 / 0.04)";

/** 42,400 -> "42.4k" for an axis tick. Full precision belongs in the tooltip. */
export function compactMinor(minor: number): string {
  const value = Math.abs(minor) / 100;
  const sign = minor < 0 ? "-" : "";
  if (value >= 1_000_000) return sign + (value / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (value >= 1_000) return sign + (value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return sign + String(Math.round(value));
}
