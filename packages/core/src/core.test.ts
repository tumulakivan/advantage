import { describe, expect, it } from "vitest";

import { buildBreakdown, budgetVerdict, buildCashflowSeries, computeKpis } from "./analytics";
import { addMonths, dueDateIn, monthRange, nextOccurrence, relativeDayLabel } from "./dates";
import { formatMoney, parseAmount, share, toMinor } from "./money";

describe("money", () => {
  it("stores pesos as integer centavos", () => {
    expect(toMinor(1234.56)).toBe(123456);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });

  it("parses the ways a human types an amount", () => {
    expect(parseAmount("50000")).toBe(5000000);
    expect(parseAmount("1,234.5")).toBe(123450);
    expect(parseAmount("P 2,500.75")).toBe(250075);
    expect(parseAmount("-1234.56")).toBe(-123456);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("0")).toBe(0);
  });

  it("formats with a sign only when asked", () => {
    expect(formatMoney(5000000, { currency: "PHP", locale: "en-PH" })).toContain("50,000.00");
    expect(formatMoney(5000000, { signed: true })).toMatch(/^\+/);
    expect(formatMoney(-123456)).toMatch(/^-/);
  });

  it("never divides by zero", () => {
    expect(share(100, 0)).toBe(0);
  });
});

describe("dates", () => {
  it("walks months across year boundaries", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("clamps a due day into a short month", () => {
    expect(dueDateIn("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateIn("2026-03", 15)).toBe("2026-03-15");
  });

  it("finds the next occurrence of a schedule", () => {
    expect(nextOccurrence("monthly", "2026-01-15", "2026-09-20")).toBe("2026-10-15");
    expect(nextOccurrence("weekly", "2026-09-01", "2026-09-20")).toBe("2026-09-22");
    expect(nextOccurrence("once", "2026-01-01", "2026-09-20")).toBeNull();
  });

  it("labels days relative to today", () => {
    expect(relativeDayLabel("2026-09-19", "2026-09-19")).toBe("Today");
    expect(relativeDayLabel("2026-09-20", "2026-09-19")).toBe("Tomorrow");
    expect(relativeDayLabel("2026-09-25", "2026-09-19")).toBe("in 6 days");
  });
});

describe("breakdown", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    key: `c${i}`,
    label: `Category ${i}`,
    color: "chart-1",
    amountMinor: (10 - i) * 1000,
  }));

  it("keeps seven slices and folds the tail into Other", () => {
    const result = buildBreakdown(rows);
    expect(result.slices).toHaveLength(8);
    expect(result.slices.at(-1)?.isOther).toBe(true);
    expect(result.foldedCount).toBe(3);
  });

  it("shares sum to one", () => {
    const total = buildBreakdown(rows).slices.reduce((sum, slice) => sum + slice.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("drops zero and negative rows", () => {
    const result = buildBreakdown([
      { key: "a", label: "A", color: "chart-1", amountMinor: 0 },
      { key: "b", label: "B", color: "chart-2", amountMinor: 500 },
    ]);
    expect(result.slices).toHaveLength(1);
    expect(result.totalMinor).toBe(500);
  });
});

describe("cashflow", () => {
  it("fills months with no records", () => {
    const series = buildCashflowSeries(
      [{ month: "2026-09", incomeMinor: 5000000, expenseMinor: 1200000 }],
      ["2026-08", "2026-09"],
      "en-PH",
    );
    expect(series).toHaveLength(2);
    expect(series[0]?.incomeMinor).toBe(0);
    expect(series[1]?.netMinor).toBe(5000000 - 1200000);
    expect(series[1]?.expenseSignedMinor).toBe(-1200000);
  });

  it("leaves the net line undrawn for months with no records", () => {
    const series = buildCashflowSeries(
      [{ month: "2026-09", incomeMinor: 100, expenseMinor: 0 }],
      ["2026-08", "2026-09"],
    );
    expect(series[0]?.hasRecords).toBe(false);
    expect(series[0]?.netLineMinor).toBeNull();
    expect(series[1]?.hasRecords).toBe(true);
    expect(series[1]?.netLineMinor).toBe(100);
  });
});

describe("kpis", () => {
  it("computes net, savings rate and deltas", () => {
    const kpis = computeKpis(
      { month: "2026-09", incomeMinor: 5000000, expenseMinor: 2000000 },
      { month: "2026-08", incomeMinor: 5000000, expenseMinor: 1200000 },
    );
    expect(kpis.netMinor).toBe(3000000);
    expect(kpis.savingsRate).toBeCloseTo(0.6, 3);
    expect(kpis.incomeDelta).toBe(0);
    // spending went 12,000 -> 20,000, a two-thirds rise
    expect(kpis.expenseDelta).toBeCloseTo(2 / 3, 5);
  });

  it("returns null deltas with no baseline", () => {
    const kpis = computeKpis({ month: "2026-09", incomeMinor: 100, expenseMinor: 50 });
    expect(kpis.incomeDelta).toBeNull();
  });
});

describe("budget verdict", () => {
  it("flags an over-limit budget", () => {
    const verdict = budgetVerdict(120000, 100000, "2026-09", new Date(2026, 8, 20));
    expect(verdict.state).toBe("over");
    expect(verdict.remainingMinor).toBe(-20000);
  });

  it("warns early when the run-rate overshoots", () => {
    const verdict = budgetVerdict(50000, 100000, "2026-09", new Date(2026, 8, 5));
    expect(verdict.state).toBe("ok");
    expect(verdict.offPace).toBe(true);
    expect(verdict.projectedMinor).toBe(300000);
  });

  it("stays calm when the pace lands under", () => {
    const verdict = budgetVerdict(70000, 100000, "2026-09", new Date(2026, 8, 28));
    expect(verdict.offPace).toBe(false);
  });
});
