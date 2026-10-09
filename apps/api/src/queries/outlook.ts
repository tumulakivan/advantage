import {
  occurrencesBetween,
  todayIso,
  type BalanceBasis,
  type BalanceMove,
  type Frequency,
  type IsoDate,
  type OutlookEntry,
} from "@advantage/core";

import type { Tenant } from "../db/tenant";
import { netWorth } from "./analytics";
import { effectiveColor } from "./mappers";

/**
 * Everything that moves money inside a window, from both sides of the ledger:
 * records that exist, and schedule occurrences that do not yet.
 *
 * The two are kept apart by `kind` rather than merged, because the difference
 * between "this happened" and "this is expected" is the whole point of an
 * outlook. Transfers are excluded on both sides - moving money between your own
 * accounts is neither income nor spending.
 *
 * Before today only records count. A schedule date that has passed without
 * being posted either happened and was logged by hand - so counting it would
 * double it - or did not happen at all; either way it is not money still to
 * come, and the balance line has to meet the real balance at today.
 */
export async function outlookEntries(
  tenant: Tenant,
  from: IsoDate,
  to: IsoDate,
  today: IsoDate = todayIso(),
): Promise<OutlookEntry[]> {
  const { db, userId } = tenant;

  const [logged, schedules] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        date: { gte: from, lte: to },
        // Transfers and balance adjustments move money without earning or
        // spending any, so neither belongs in a forecast of cash flow.
        type: { in: ["income", "expense"] },
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

  const plannedFrom = from > today ? from : today;

  for (const schedule of schedules) {
    const dates = occurrencesBetween(
      schedule.frequency as Frequency,
      schedule.anchorDate,
      plannedFrom,
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

/**
 * What the outlook's balance line stands on: the total going into `from`, and
 * every logged change to it inside the window.
 *
 * The opening figure is worked back from today's net worth rather than summed
 * forward, so it agrees with the dashboard by construction. Every record type
 * counts here, not just income and spending: a Set balance moves the total,
 * and so does a transfer that crosses into or out of an account kept out of
 * totals. A transfer between two counted accounts nets to nothing, as it should.
 */
export async function balanceBasis(
  tenant: Tenant,
  from: IsoDate,
  to: IsoDate,
): Promise<BalanceBasis> {
  const { db, userId } = tenant;

  const [worth, accounts, records] = await Promise.all([
    netWorth(tenant),
    db.account.findMany({ where: { userId }, select: { id: true, excludeFromTotals: true } }),
    db.transaction.findMany({
      where: { userId, date: { gte: from } },
      select: { date: true, type: true, amountMinor: true, accountId: true, toAccountId: true },
    }),
  ]);

  const counted = new Set(accounts.filter((row) => !row.excludeFromTotals).map((row) => row.id));

  let sinceFrom = 0;
  const loggedMoves: BalanceMove[] = [];
  for (const row of records) {
    let delta = 0;
    if (counted.has(row.accountId)) {
      delta += row.type === "income" || row.type === "adjustment" ? row.amountMinor : -row.amountMinor;
    }
    if (row.type === "transfer" && row.toAccountId && counted.has(row.toAccountId)) {
      delta += row.amountMinor;
    }
    if (delta === 0) continue;

    sinceFrom += delta;
    if (row.date <= to) loggedMoves.push({ date: row.date, deltaMinor: delta });
  }

  return { openingMinor: worth - sinceFrom, loggedMoves };
}
