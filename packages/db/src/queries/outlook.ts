import { occurrencesBetween, type IsoDate, type OutlookEntry } from "@advantage/core";
import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "../client";
import { accounts, categories, incomeSources, plannedPayments, transactions } from "../schema";

const parent = alias(categories, "parent_category");

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
  db: Database,
  from: IsoDate,
  to: IsoDate,
): Promise<OutlookEntry[]> {
  const [logged, schedules] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        payee: transactions.payee,
        note: transactions.note,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: sql<string | null>`COALESCE(${categories.color}, ${parent.color})`,
        accountName: accounts.name,
        sourceLogo: incomeSources.logo,
        sourceShortName: incomeSources.shortName,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(parent, eq(categories.parentId, parent.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(incomeSources, eq(transactions.incomeSourceId, incomeSources.id))
      .where(
        and(
          gte(transactions.date, from),
          lte(transactions.date, to),
          ne(transactions.type, "transfer"),
        ),
      )
      .orderBy(asc(transactions.date)),

    db
      .select({
        id: plannedPayments.id,
        name: plannedPayments.name,
        type: plannedPayments.type,
        amountMinor: plannedPayments.amountMinor,
        frequency: plannedPayments.frequency,
        anchorDate: plannedPayments.anchorDate,
        endDate: plannedPayments.endDate,
        lastPostedDate: plannedPayments.lastPostedDate,
        note: plannedPayments.note,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: sql<string | null>`COALESCE(${categories.color}, ${parent.color})`,
        accountName: accounts.name,
        sourceLogo: incomeSources.logo,
      })
      .from(plannedPayments)
      .leftJoin(categories, eq(plannedPayments.categoryId, categories.id))
      .leftJoin(parent, eq(categories.parentId, parent.id))
      .leftJoin(accounts, eq(plannedPayments.accountId, accounts.id))
      .leftJoin(incomeSources, eq(plannedPayments.incomeSourceId, incomeSources.id))
      .where(eq(plannedPayments.active, true)),
  ]);

  const entries: OutlookEntry[] = logged.map((row) => ({
    id: row.id,
    date: row.date,
    kind: "logged" as const,
    direction: row.type === "income" ? ("income" as const) : ("expense" as const),
    amountMinor: Number(row.amountMinor),
    label: row.payee || row.categoryName || (row.type === "income" ? "Income" : "Expense"),
    detail: row.sourceShortName ?? row.note ?? null,
    categoryName: row.categoryName,
    categoryIcon: row.categoryIcon,
    categoryColor: row.categoryColor,
    accountName: row.accountName,
    sourceLogo: row.sourceLogo,
  }));

  for (const schedule of schedules) {
    const dates = occurrencesBetween(
      schedule.frequency,
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
        amountMinor: Number(schedule.amountMinor),
        label: schedule.name,
        detail: schedule.note,
        categoryName: schedule.categoryName,
        categoryIcon: schedule.categoryIcon,
        categoryColor: schedule.categoryColor,
        accountName: schedule.accountName,
        sourceLogo: schedule.sourceLogo,
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
