import type { PlannedInput, PlannedPatch, PlannedRow } from "@advantage/api-client/types";
import { addDays, nextOccurrence, todayIso, type IsoDate } from "@advantage/core";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { transact, type Tenant } from "../db/tenant";
import { ApiError } from "../errors";
import { effectiveColor, toPlannedPayment } from "./mappers";
import { createTransaction } from "./transactions";

const withLabels = {
  category: { include: { parent: true } },
  account: true,
  incomeSource: true,
} satisfies Prisma.PlannedPaymentInclude;

/**
 * The recurring side of the ledger: bills, installments and the two monthly
 * payouts. Due dates are projected in JS rather than stored, so changing a
 * schedule never leaves a stale date behind.
 */
export async function listPlanned(
  tenant: Tenant,
  options: { from?: IsoDate; includeInactive?: boolean } = {},
): Promise<PlannedRow[]> {
  const from = options.from ?? todayIso();

  const rows = await tenant.db.plannedPayment.findMany({
    where: {
      userId: tenant.userId,
      ...(options.includeInactive ? {} : { active: true }),
    },
    include: withLabels,
    orderBy: { name: "asc" },
  });

  const enriched = rows.map((row): PlannedRow => {
    const planned = toPlannedPayment(row);
    const nextDueDate = planned.active
      ? nextOccurrence(planned.frequency, planned.anchorDate, from)
      : null;
    const withinEnd = !planned.endDate || !nextDueDate || nextDueDate <= planned.endDate;
    const due = withinEnd ? nextDueDate : null;

    return {
      ...planned,
      categoryName: row.category?.name ?? null,
      categoryIcon: row.category?.icon ?? null,
      categoryColor: effectiveColor(row.category),
      accountName: row.account?.name ?? null,
      sourceName: row.incomeSource?.shortName ?? null,
      sourceColor: row.incomeSource?.color ?? null,
      nextDueDate: due,
      daysUntilDue: due
        ? Math.round((new Date(due).getTime() - new Date(from).getTime()) / 86_400_000)
        : null,
      postedForCurrent: Boolean(
        planned.lastPostedDate && due && planned.lastPostedDate >= due,
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
export async function listUpcoming(tenant: Tenant, days = 30): Promise<PlannedRow[]> {
  const today = todayIso();
  const horizon = addDays(today, days);
  const rows = await listPlanned(tenant, { from: today });
  return rows.filter((row) => row.nextDueDate !== null && row.nextDueDate <= horizon);
}

export async function createPlanned(
  tenant: Tenant,
  input: PlannedInput & { id?: string },
): Promise<string> {
  const id = input.id ?? randomUUID();
  await tenant.db.plannedPayment.create({
    data: {
      id,
      userId: tenant.userId,
      name: input.name,
      type: input.type,
      amountMinor: Math.abs(input.amountMinor),
      frequency: input.frequency,
      anchorDate: input.anchorDate,
      endDate: input.endDate ?? null,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      incomeSourceId: input.incomeSourceId ?? null,
      note: input.note ?? null,
      lastPostedDate: input.lastPostedDate ?? null,
      active: input.active,
      createdAt: new Date().toISOString(),
    },
  });
  return id;
}

export async function updatePlanned(
  tenant: Tenant,
  id: string,
  patch: PlannedPatch,
): Promise<void> {
  await tenant.db.plannedPayment.updateMany({
    where: { id, userId: tenant.userId },
    data: {
      ...patch,
      ...(patch.amountMinor === undefined
        ? {}
        : { amountMinor: Math.abs(patch.amountMinor) }),
    },
  });
}

export async function deletePlanned(tenant: Tenant, id: string): Promise<void> {
  await tenant.db.plannedPayment.deleteMany({ where: { id, userId: tenant.userId } });
}

/**
 * Turn a due occurrence into a real record. The amount is overridable because
 * a bill is a promise, not a receipt - installments and utilities rarely land
 * on the exact planned figure.
 */
export async function postPlanned(
  tenant: Tenant,
  id: string,
  overrides: { date?: IsoDate; amountMinor?: number } = {},
): Promise<string> {
  return transact(tenant, async (t) => {
    const row = await t.db.plannedPayment.findFirst({
      where: { id, userId: t.userId },
    });
    if (!row) throw ApiError.notFound("Planned payment not found");

    const planned = toPlannedPayment(row);
    const date =
      overrides.date ?? nextOccurrence(planned.frequency, planned.anchorDate) ?? todayIso();

    if (!planned.accountId) {
      throw ApiError.badRequest("This planned payment has no account set");
    }

    const transactionId = await createTransaction(t, {
      type: planned.type,
      amountMinor: overrides.amountMinor ?? planned.amountMinor,
      date,
      accountId: planned.accountId,
      toAccountId: null,
      categoryId: planned.categoryId,
      incomeSourceId: planned.incomeSourceId,
      payee: planned.name,
      note: planned.note,
      plannedPaymentId: planned.id,
    });

    await t.db.plannedPayment.updateMany({
      where: { id, userId: t.userId },
      data: { lastPostedDate: date },
    });

    return transactionId;
  });
}

/**
 * Undo a post. It deletes the record it created as well as clearing the marker:
 * leaving the transaction behind would double-count the bill, and clearing only
 * the marker would invite a second post of the same occurrence.
 */
export async function unpostPlanned(tenant: Tenant, id: string): Promise<void> {
  await transact(tenant, async (t) => {
    const row = await t.db.plannedPayment.findFirst({
      where: { id, userId: t.userId },
      select: { lastPostedDate: true },
    });

    if (row?.lastPostedDate) {
      await t.db.transaction.deleteMany({
        where: { userId: t.userId, plannedPaymentId: id, date: row.lastPostedDate },
      });
    }

    await t.db.plannedPayment.updateMany({
      where: { id, userId: t.userId },
      data: { lastPostedDate: null },
    });
  });
}
