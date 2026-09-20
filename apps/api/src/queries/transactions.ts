import type {
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionPatch,
  TransactionRow,
} from "@advantage/api-client/types";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import type { Tenant } from "../db/tenant";
import { effectiveColor, toTransaction } from "./mappers";

/** Everything a transaction row needs to render without a second lookup. */
const withLabels = {
  category: { include: { parent: true } },
  account: true,
  toAccount: true,
  incomeSource: true,
} satisfies Prisma.TransactionInclude;

type LabelledTransaction = Prisma.TransactionGetPayload<{ include: typeof withLabels }>;

function toRow(row: LabelledTransaction): TransactionRow {
  return {
    ...toTransaction(row),
    categoryName: row.category?.name ?? null,
    categoryIcon: row.category?.icon ?? null,
    categoryColor: effectiveColor(row.category),
    parentCategoryName: row.category?.parent?.name ?? null,
    accountName: row.account?.name ?? null,
    accountIcon: row.account?.icon ?? null,
    toAccountName: row.toAccount?.name ?? null,
    sourceName: row.incomeSource?.name ?? null,
    sourceShortName: row.incomeSource?.shortName ?? null,
    sourceColor: row.incomeSource?.color ?? null,
  };
}

async function buildWhere(
  tenant: Tenant,
  filters: TransactionFilters,
): Promise<Prisma.TransactionWhereInput> {
  const where: Prisma.TransactionWhereInput = { userId: tenant.userId };

  if (filters.types && filters.types.length > 0) {
    where.type = { in: filters.types };
  }
  if (filters.accountId) {
    where.OR = [{ accountId: filters.accountId }, { toAccountId: filters.accountId }];
  }
  if (filters.categoryId) {
    // A filter on a group means the group and everything under it, otherwise
    // a filter on "Food & Dining" would hide every grocery run.
    const children = await tenant.db.category.findMany({
      where: { userId: tenant.userId, parentId: filters.categoryId },
      select: { id: true },
    });
    where.categoryId = { in: [filters.categoryId, ...children.map((child) => child.id)] };
  }
  if (filters.incomeSourceId) {
    where.incomeSourceId = filters.incomeSourceId;
  }
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters.search) {
    const needle = filters.search;
    const match: Prisma.TransactionWhereInput[] = [
      { payee: { contains: needle, mode: "insensitive" } },
      { note: { contains: needle, mode: "insensitive" } },
    ];
    // An account filter already claimed `OR`; both conditions have to hold, so
    // they go into AND rather than quietly widening each other.
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: match }];
      delete where.OR;
    } else {
      where.OR = match;
    }
  }

  return where;
}

export async function listTransactions(
  tenant: Tenant,
  filters: TransactionFilters = {},
): Promise<TransactionRow[]> {
  const rows = await tenant.db.transaction.findMany({
    where: await buildWhere(tenant, filters),
    include: withLabels,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: filters.limit ?? 200,
    skip: filters.offset ?? 0,
  });

  return rows.map(toRow);
}

export async function getTransaction(tenant: Tenant, id: string): Promise<Transaction | null> {
  const row = await tenant.db.transaction.findFirst({
    where: { id, userId: tenant.userId },
  });
  return row ? toTransaction(row) : null;
}

export async function createTransaction(
  tenant: Tenant,
  input: TransactionInput & { id?: string },
): Promise<string> {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();

  await tenant.db.transaction.create({
    data: {
      id,
      userId: tenant.userId,
      type: input.type,
      // Stored as a magnitude; `type` is what carries the direction.
      amountMinor: Math.abs(input.amountMinor),
      date: input.date,
      accountId: input.accountId,
      toAccountId: input.toAccountId ?? null,
      categoryId: input.categoryId ?? null,
      incomeSourceId: input.incomeSourceId ?? null,
      payee: input.payee ?? null,
      note: input.note ?? null,
      plannedPaymentId: input.plannedPaymentId ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });

  return id;
}

export async function updateTransaction(
  tenant: Tenant,
  id: string,
  patch: TransactionPatch,
): Promise<void> {
  await tenant.db.transaction.updateMany({
    where: { id, userId: tenant.userId },
    data: {
      ...patch,
      ...(patch.amountMinor === undefined
        ? {}
        : { amountMinor: Math.abs(patch.amountMinor) }),
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function deleteTransaction(tenant: Tenant, id: string): Promise<void> {
  await tenant.db.transaction.deleteMany({ where: { id, userId: tenant.userId } });
}
