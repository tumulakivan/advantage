import { describe, expect, it } from "vitest";

import {
  bucketOf,
  bucketsBetween,
  buildOutlook,
  granularityFor,
  occurrencesBetween,
  type OutlookEntry,
} from "./schedule";

describe("occurrencesBetween", () => {
  it("returns a one-off only when it falls inside the window", () => {
    expect(occurrencesBetween("once", "2026-10-17", "2026-10-01", "2026-10-31")).toEqual([
      "2026-10-17",
    ]);
    expect(occurrencesBetween("once", "2026-10-17", "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("walks weekly from the anchor, never before it", () => {
    expect(occurrencesBetween("weekly", "2026-09-22", "2026-09-01", "2026-10-13")).toEqual([
      "2026-09-22",
      "2026-09-29",
      "2026-10-06",
      "2026-10-13",
    ]);
  });

  it("skips forward to the window without drifting off the weekday", () => {
    const dates = occurrencesBetween("weekly", "2026-09-22", "2026-12-01", "2026-12-31");
    expect(dates).toEqual(["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22", "2026-12-29"]);
  });

  it("walks monthly and clamps into short months", () => {
    expect(occurrencesBetween("monthly", "2026-12-31", "2027-01-01", "2027-03-31")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });

  it("honours an end date", () => {
    expect(
      occurrencesBetween("monthly", "2026-12-20", "2026-12-01", "2027-06-30", "2027-02-28"),
    ).toEqual(["2026-12-20", "2027-01-20", "2027-02-20"]);
  });

  it("handles quarterly and yearly steps", () => {
    expect(occurrencesBetween("quarterly", "2026-01-15", "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
    expect(occurrencesBetween("yearly", "2026-03-01", "2026-01-01", "2028-12-31")).toEqual([
      "2026-03-01",
      "2027-03-01",
      "2028-03-01",
    ]);
  });

  it("returns nothing for an inverted or pre-anchor window", () => {
    expect(occurrencesBetween("weekly", "2026-09-22", "2026-10-01", "2026-09-01")).toEqual([]);
    expect(occurrencesBetween("monthly", "2026-09-28", "2026-01-01", "2026-06-30")).toEqual([]);
  });
});

describe("buckets", () => {
  it("picks a bucket size the axis can carry", () => {
    expect(granularityFor("2026-09-01", "2026-09-30")).toBe("day");
    expect(granularityFor("2026-01-01", "2026-12-31")).toBe("month");
    expect(granularityFor("2020-01-01", "2026-12-31")).toBe("year");
  });

  it("fills every bucket in the window", () => {
    expect(bucketsBetween("2026-09-28", "2026-10-02", "day")).toHaveLength(5);
    expect(bucketsBetween("2026-11-15", "2027-02-02", "month")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(bucketsBetween("2026-06-01", "2028-01-01", "year")).toEqual(["2026", "2027", "2028"]);
  });

  it("keys weeks by their Monday, starting from the week holding the window's first day", () => {
    // 2026-10-01 is a Thursday, so the first week starts on Monday 28 September.
    expect(bucketsBetween("2026-10-01", "2026-10-31", "week")).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(bucketOf("2026-10-13", "week")).toBe("2026-10-12");
    expect(bucketOf("2026-10-18", "week")).toBe("2026-10-12");
    expect(bucketOf("2026-10-19", "week")).toBe("2026-10-19");
  });
});

describe("buildOutlook", () => {
  const entry = (
    date: string,
    direction: "income" | "expense",
    amountMinor: number,
    kind: "logged" | "planned",
  ): OutlookEntry => ({
    id: `${date}:${direction}:${amountMinor}`,
    date,
    kind,
    direction,
    amountMinor,
    label: "x",
    detail: null,
    categoryName: null,
    categoryIcon: null,
    categoryColor: null,
    accountName: null,
    sourceColor: null,
  });

  const entries = [
    entry("2026-09-22", "income", 1_000_000, "logged"),
    entry("2026-09-22", "expense", 700_000, "logged"),
    entry("2026-10-06", "income", 1_000_000, "planned"),
    entry("2026-10-06", "expense", 200_000, "planned"),
    entry("2026-11-28", "income", 2_500_000, "planned"),
  ];

  it("splits what is known from what is only expected", () => {
    const outlook = buildOutlook(entries, "2026-09-01", "2026-11-30", {
      today: "2026-09-25",
    });

    expect(outlook.granularity).toBe("month");
    expect(outlook.buckets.map((bucket) => bucket.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(outlook.totals.loggedCount).toBe(2);
    expect(outlook.totals.plannedCount).toBe(3);
    expect(outlook.totals.loggedNetMinor).toBe(1_000_000 - 700_000);
    expect(outlook.totals.plannedNetMinor).toBe(1_000_000 - 200_000 + 2_500_000);
    expect(outlook.totals.netMinor).toBe(
      outlook.totals.loggedNetMinor + outlook.totals.plannedNetMinor,
    );
  });

  it("marks the bucket holding today, and only when it is in range", () => {
    expect(
      buildOutlook(entries, "2026-09-01", "2026-11-30", { today: "2026-09-25" }).todayBucket,
    ).toBe("2026-09");
    expect(
      buildOutlook(entries, "2026-09-01", "2026-11-30", { today: "2027-01-05" }).todayBucket,
    ).toBeNull();
  });

  it("carries the balance through a bucket where nothing moves", () => {
    const outlook = buildOutlook(
      [entry("2026-09-22", "income", 100, "logged")],
      "2026-09-01",
      "2026-10-31",
      // 60 days would auto-pick daily buckets; this test is about months.
      { today: "2026-09-25", granularity: "month" },
    );
    expect(outlook.buckets[0]?.balanceMinor).toBe(100);
    expect(outlook.buckets[1]?.hasEntries).toBe(false);
    expect(outlook.buckets[1]?.balanceMinor).toBe(100);
  });

  it("runs the balance from the opening figure, logged moves first, then the plan", () => {
    const outlook = buildOutlook(entries, "2026-09-01", "2026-11-30", {
      today: "2026-09-25",
      balance: {
        openingMinor: 5_000_000,
        // The two logged entries, plus a Set balance that is in neither column.
        loggedMoves: [
          { date: "2026-09-22", deltaMinor: 1_000_000 },
          { date: "2026-09-22", deltaMinor: -700_000 },
          { date: "2026-09-24", deltaMinor: -50_000 },
        ],
      },
    });

    expect(outlook.buckets.map((bucket) => bucket.balanceMinor)).toEqual([
      5_000_000 + 300_000 - 50_000,
      5_000_000 + 300_000 - 50_000 + 800_000,
      5_000_000 + 300_000 - 50_000 + 800_000 + 2_500_000,
    ]);
    // The adjustment moves the balance without being income or spending.
    expect(outlook.buckets[0]?.netMinor).toBe(300_000);
    expect(outlook.totals.openingBalanceMinor).toBe(5_000_000);
    expect(outlook.totals.closingBalanceMinor).toBe(outlook.buckets[2]?.balanceMinor);
    // Today's balance is the records alone, not where September closes.
    expect(outlook.totals.todayBalanceMinor).toBe(5_000_000 + 300_000 - 50_000);
  });

  it("reports how much of a bucket is still only planned", () => {
    const outlook = buildOutlook(entries, "2026-09-01", "2026-11-30", { today: "2026-09-25" });
    expect(outlook.buckets[0]?.plannedShare).toBe(0);
    expect(outlook.buckets[1]?.plannedShare).toBe(1);
  });

  it("groups a week's entries together, weekly pay included", () => {
    const outlook = buildOutlook(entries, "2026-09-21", "2026-10-11", {
      today: "2026-09-25",
      granularity: "week",
    });
    expect(outlook.buckets.map((bucket) => bucket.key)).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
    expect(outlook.todayBucket).toBe("2026-09-21");
    expect(outlook.buckets[0]?.netMinor).toBe(300_000);
    expect(outlook.buckets[1]?.hasEntries).toBe(false);
    expect(outlook.buckets[2]?.netMinor).toBe(800_000);
  });

  it("ignores entries outside the window", () => {
    const outlook = buildOutlook(entries, "2026-10-01", "2026-10-31", { today: "2026-10-05" });
    expect(outlook.totals.loggedCount).toBe(0);
    expect(outlook.totals.plannedCount).toBe(2);
  });
});
