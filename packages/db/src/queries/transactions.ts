import type { TransactionType } from "@advantage/core";
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "../client";
import {
  accounts,
  categories,
  incomeSources,
  transactions,
  type NewTransaction,
  type Transaction,
} from "../schema";

const parentCategory = alias(categories, "parent_category");
const toAccount = alias(accounts, "to_account");

export interface TransactionRow extends Transaction {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  parentCategoryName: string | null;
  accountName: string | null;
  accountIcon: string | null;
  toAccountName: string | null;
  sourceName: string | null;
  sourceShortName: string | null;
  sourceLogo: string | null;
  sourceColor: string | null;
}

export interface TransactionFilters {
  types?: TransactionType[];
  accountId?: string;
  /** Matches the category itself or any of its children. */
  categoryId?: string;
  incomeSourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const selection = {
  id: transactions.id,
  type: transactions.type,
  amountMinor: transactions.amountMinor,
  date: transactions.date,
  accountId: transactions.accountId,
  toAccountId: transactions.toAccountId,
  categoryId: transactions.categoryId,
  incomeSourceId: transactions.incomeSourceId,
  payee: transactions.payee,
  note: transactions.note,
  plannedPaymentId: transactions.plannedPaymentId,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  // A subcategory has no hue of its own - it wears its group's.
  categoryColor: sql<string | null>`COALESCE(${categories.color}, ${parentCategory.color})`,
  parentCategoryName: parentCategory.name,
  accountName: accounts.name,
  accountIcon: accounts.icon,
  toAccountName: toAccount.name,
  sourceName: incomeSources.name,
  sourceShortName: incomeSources.shortName,
  sourceLogo: incomeSources.logo,
  sourceColor: incomeSources.color,
};

async function buildWhere(db: Database, filters: TransactionFilters) {
  const clauses = [];

  if (filters.types && filters.types.length > 0) {
    clauses.push(inArray(transactions.type, filters.types));
  }
  if (filters.accountId) {
    clauses.push(
      or(
        eq(transactions.accountId, filters.accountId),
        eq(transactions.toAccountId, filters.accountId),
      ),
    );
  }
  if (filters.categoryId) {
    const children = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, filters.categoryId));
    const ids = [filters.categoryId, ...children.map((child) => child.id)];
    clauses.push(inArray(transactions.categoryId, ids));
  }
  if (filters.incomeSourceId) {
    clauses.push(eq(transactions.incomeSourceId, filters.incomeSourceId));
  }
  if (filters.dateFrom) clauses.push(gte(transactions.date, filters.dateFrom));
  if (filters.dateTo) clauses.push(lte(transactions.date, filters.dateTo));
  if (filters.search) {
    const needle = `%${filters.search.toLowerCase()}%`;
    clauses.push(
      or(
        like(sql`LOWER(${transactions.payee})`, needle),
        like(sql`LOWER(${transactions.note})`, needle),
      ),
    );
  }

  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listTransactions(
  db: Database,
  filters: TransactionFilters = {},
): Promise<TransactionRow[]> {
  const where = await buildWhere(db, filters);

  const rows = await db
    .select(selection)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccount, eq(transactions.toAccountId, toAccount.id))
    .leftJoin(incomeSources, eq(transactions.incomeSourceId, incomeSources.id))
    .where(where)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(filters.limit ?? 200)
    .offset(filters.offset ?? 0);

  return rows as TransactionRow[];
}

export async function getTransaction(db: Database, id: string): Promise<Transaction | null> {
  const rows = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return rows[0] ?? null;
}

export type TransactionInput = Omit<NewTransaction, "id" | "createdAt" | "updatedAt">;

export async function createTransaction(db: Database, input: TransactionInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(transactions).values({
    ...input,
    id,
    amountMinor: Math.abs(input.amountMinor),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateTransaction(
  db: Database,
  id: string,
  patch: Partial<TransactionInput>,
): Promise<void> {
  await db
    .update(transactions)
    .set({
      ...patch,
      ...(patch.amountMinor === undefined ? {} : { amountMinor: Math.abs(patch.amountMinor) }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(transactions.id, id));
}

export async function deleteTransaction(db: Database, id: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.id, id));
}
