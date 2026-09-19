import { addDays, nextOccurrence, todayIso, type IsoDate } from "@advantage/core";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "../client";
import {
  accounts,
  categories,
  incomeSources,
  plannedPayments,
  transactions,
  type NewPlannedPayment,
  type PlannedPayment,
} from "../schema";
import { createTransaction } from "./transactions";

const parent = alias(categories, "parent_category");

export interface PlannedRow extends PlannedPayment {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string | null;
  sourceName: string | null;
  sourceLogo: string | null;
  /** Next due date, or null for a finished schedule. */
  nextDueDate: string | null;
  /** Negative when already overdue. */
  daysUntilDue: number | null;
  /** True once a record has been posted for the current occurrence. */
  postedForCurrent: boolean;
}

/**
 * The recurring side of the ledger: bills, installments and the two monthly
 * payouts. Due dates are projected in JS rather than stored, so changing a
 * schedule never leaves a stale date behind.
 */
export async function listPlanned(
  db: Database,
  options: { from?: IsoDate; includeInactive?: boolean } = {},
): Promise<PlannedRow[]> {
  const from = options.from ?? todayIso();

  const rows = await db
    .select({
      id: plannedPayments.id,
      name: plannedPayments.name,
      type: plannedPayments.type,
      amountMinor: plannedPayments.amountMinor,
      frequency: plannedPayments.frequency,
      anchorDate: plannedPayments.anchorDate,
      endDate: plannedPayments.endDate,
      accountId: plannedPayments.accountId,
      categoryId: plannedPayments.categoryId,
      incomeSourceId: plannedPayments.incomeSourceId,
      note: plannedPayments.note,
      lastPostedDate: plannedPayments.lastPostedDate,
      active: plannedPayments.active,
      createdAt: plannedPayments.createdAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: sql<string | null>`COALESCE(${categories.color}, ${parent.color})`,
      accountName: accounts.name,
      sourceName: incomeSources.shortName,
      sourceLogo: incomeSources.logo,
    })
    .from(plannedPayments)
    .leftJoin(categories, eq(plannedPayments.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .leftJoin(accounts, eq(plannedPayments.accountId, accounts.id))
    .leftJoin(incomeSources, eq(plannedPayments.incomeSourceId, incomeSources.id))
    .orderBy(asc(plannedPayments.name));

  const enriched = rows
    .filter((row) => options.includeInactive || row.active)
    .map((row) => {
      const nextDueDate = row.active
        ? nextOccurrence(row.frequency, row.anchorDate, from)
        : null;
      const withinEnd = !row.endDate || !nextDueDate || nextDueDate <= row.endDate;

      return {
        ...row,
        nextDueDate: withinEnd ? nextDueDate : null,
        daysUntilDue:
          withinEnd && nextDueDate
            ? Math.round(
                (new Date(nextDueDate).getTime() - new Date(from).getTime()) / 86_400_000,
              )
            : null,
        postedForCurrent: Boolean(
          row.lastPostedDate && nextDueDate && row.lastPostedDate >= nextDueDate,
        ),
      };
    });

  return enriched.sort((a, b) => {
    if (a.nextDueDate && b.nextDueDate) return a.nextDueDate.localeCompare(b.nextDueDate);
    if (a.nextDueDate) return -1;
    if (b.nextDueDate) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Everything due in the next `days` days, including anything already overdue. */
export async function listUpcoming(db: Database, days = 30): Promise<PlannedRow[]> {
  const today = todayIso();
  const horizon = addDays(today, days);
  const rows = await listPlanned(db, { from: today });
  return rows.filter((row) => row.nextDueDate !== null && row.nextDueDate <= horizon);
}

export type PlannedInput = Omit<NewPlannedPayment, "id" | "createdAt">;

export async function createPlanned(db: Database, input: PlannedInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(plannedPayments).values({
    ...input,
    id,
    amountMinor: Math.abs(input.amountMinor),
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function updatePlanned(
  db: Database,
  id: string,
  patch: Partial<PlannedInput>,
): Promise<void> {
  await db
    .update(plannedPayments)
    .set({
      ...patch,
      ...(patch.amountMinor === undefined ? {} : { amountMinor: Math.abs(patch.amountMinor) }),
    })
    .where(eq(plannedPayments.id, id));
}

export async function deletePlanned(db: Database, id: string): Promise<void> {
  await db.delete(plannedPayments).where(eq(plannedPayments.id, id));
}

/**
 * Turn a due occurrence into a real record. The amount is overridable because
 * a bill is a promise, not a receipt - installments and utilities rarely land
 * on the exact planned figure.
 */
export async function postPlanned(
  db: Database,
  id: string,
  overrides: { date?: IsoDate; amountMinor?: number } = {},
): Promise<string> {
  const rows = await db
    .select()
    .from(plannedPayments)
    .where(eq(plannedPayments.id, id))
    .limit(1);

  const planned = rows[0];
  if (!planned) throw new Error("Planned payment not found");

  const date = overrides.date ?? nextOccurrence(planned.frequency, planned.anchorDate) ?? todayIso();
  if (!planned.accountId) throw new Error("This planned payment has no account set");

  const transactionId = await createTransaction(db, {
    type: planned.type,
    amountMinor: overrides.amountMinor ?? planned.amountMinor,
    date,
    accountId: planned.accountId,
    categoryId: planned.categoryId,
    incomeSourceId: planned.incomeSourceId,
    payee: planned.name,
    note: planned.note,
    plannedPaymentId: planned.id,
  });

  await db
    .update(plannedPayments)
    .set({ lastPostedDate: date })
    .where(eq(plannedPayments.id, id));

  return transactionId;
}

/**
 * Undo a post. It deletes the record it created as well as clearing the marker:
 * leaving the transaction behind would double-count the bill, and clearing only
 * the marker would invite a second post of the same occurrence.
 */
export async function unpostPlanned(db: Database, id: string): Promise<void> {
  const rows = await db
    .select({ lastPostedDate: plannedPayments.lastPostedDate })
    .from(plannedPayments)
    .where(eq(plannedPayments.id, id))
    .limit(1);

  const lastPostedDate = rows[0]?.lastPostedDate;
  if (lastPostedDate) {
    await db
      .delete(transactions)
      .where(
        and(eq(transactions.plannedPaymentId, id), eq(transactions.date, lastPostedDate)),
      );
  }

  await db.update(plannedPayments).set({ lastPostedDate: null }).where(eq(plannedPayments.id, id));
}
