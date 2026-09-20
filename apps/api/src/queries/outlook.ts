import { occurrencesBetween, type Frequency, type IsoDate, type OutlookEntry } from "@advantage/core";

import type { Tenant } from "../db/tenant";
import { effectiveColor } from "./mappers";

/**
 * Everything that moves money inside a window, from both sides of the ledger:
 * records that exist, and schedule occurrences that do not yet.
 *
 * The two are kept apart by `kind` rather than merged, because the difference
 * between "this happened" and "this is expected" is the whole point of an
 * outlook. Transfers are excluded on both sides - moving money between your own
 * accounts is neither income nor spending.
 */
export async function outlookEntries(
  tenant: Tenant,
  from: IsoDate,
  to: IsoDate,
): Promise<OutlookEntry[]> {
  const { db, userId } = tenant;

  const [logged, schedules] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        date: { gte: from, lte: to },
        type: { not: "transfer" },
      },
      include: {
        category: { include: { parent: true } },
        account: true,
        incomeSource: true,
      },
      orderBy: { date: "asc" },
    }),

    db.plannedPayment.findMany({
      where: { userId, active: true },
      include: {
        category: { include: { parent: true } },
        account: true,
        incomeSource: true,
      },
    }),
  ]);

  const entries: OutlookEntry[] = logged.map((row) => ({
    id: row.id,
    date: row.date,
    kind: "logged" as const,
    direction: row.type === "income" ? ("income" as const) : ("expense" as const),
    amountMinor: row.amountMinor,
    label: row.payee || row.category?.name || (row.type === "income" ? "Income" : "Expense"),
    detail: row.incomeSource?.shortName ?? row.note ?? null,
    categoryName: row.category?.name ?? null,
    categoryIcon: row.category?.icon ?? null,
    categoryColor: effectiveColor(row.category),
    accountName: row.account?.name ?? null,
    sourceColor: row.incomeSource?.color ?? null,
  }));

  for (const schedule of schedules) {
    const dates = occurrencesBetween(
      schedule.frequency as Frequency,
      schedule.anchorDate,
      from,
      to,
      schedule.endDate,
    );

    for (const date of dates) {
      // Anything up to the last posted date already exists as a record above;
      // counting the occurrence too would double it.
      if (schedule.lastPostedDate && date <= schedule.lastPostedDate) continue;

      entries.push({
        id: `${schedule.id}:${date}`,
        date,
        kind: "planned",
        direction: schedule.type === "income" ? "income" : "expense",
        amountMinor: schedule.amountMinor,
        label: schedule.name,
        detail: schedule.note,
        categoryName: schedule.category?.name ?? null,
        categoryIcon: schedule.category?.icon ?? null,
        categoryColor: effectiveColor(schedule.category),
        accountName: schedule.account?.name ?? null,
        sourceColor: schedule.incomeSource?.color ?? null,
      });
    }
  }

  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    // Money in before money out on the same day, then by size.
    if (a.direction !== b.direction) return a.direction === "income" ? -1 : 1;
    return b.amountMinor - a.amountMinor;
  });
}
