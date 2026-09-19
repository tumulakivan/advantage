import { toMinor, type AccountType, type Frequency, type TransactionType } from "@advantage/core";
import { eq } from "drizzle-orm";

import type { Database } from "../client";
import {
  accounts,
  budgets,
  categories,
  incomeSources,
  plannedPayments,
  settings,
  transactions,
  type Account,
  type Budget,
  type Category,
  type IncomeSource,
  type PlannedPayment,
  type Setting,
  type Transaction,
} from "../schema";
import { createTransaction } from "./transactions";

export const BACKUP_FORMAT = "advantage-backup";
export const RECORDS_FORMAT = "advantage-records";
export const PLAN_FORMAT = "advantage-plan";

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  tables: {
    accounts: Account[];
    categories: Category[];
    incomeSources: IncomeSource[];
    transactions: Transaction[];
    budgets: Budget[];
    plannedPayments: PlannedPayment[];
    settings: Setting[];
  };
}

/** Full-fidelity dump: ids intact, so a restore is byte-for-byte the same app. */
export async function exportBackup(db: Database): Promise<BackupPayload> {
  const [
    accountRows,
    categoryRows,
    sourceRows,
    transactionRows,
    budgetRows,
    plannedRows,
    settingRows,
  ] = await Promise.all([
    db.select().from(accounts),
    db.select().from(categories),
    db.select().from(incomeSources),
    db.select().from(transactions),
    db.select().from(budgets),
    db.select().from(plannedPayments),
    db.select().from(settings),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      accounts: accountRows,
      categories: categoryRows,
      incomeSources: sourceRows,
      transactions: transactionRows,
      budgets: budgetRows,
      plannedPayments: plannedRows,
      settings: settingRows,
    },
  };
}

function assertBackup(payload: unknown): asserts payload is BackupPayload {
  const candidate = payload as Partial<BackupPayload>;
  if (!candidate || candidate.format !== BACKUP_FORMAT) {
    throw new Error("Not an adVantage backup file");
  }
  if (candidate.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(candidate.version)}`);
  }
  if (!candidate.tables) throw new Error("Backup file has no tables");
}

/** Replaces everything. Children are cleared before parents to respect FKs. */
export async function importBackup(db: Database, payload: unknown): Promise<void> {
  assertBackup(payload);
  const { tables } = payload;

  await db.delete(transactions);
  await db.delete(budgets);
  await db.delete(plannedPayments);
  await db.delete(settings);
  await db.delete(incomeSources);
  await db.delete(categories);
  await db.delete(accounts);

  if (tables.accounts?.length) await db.insert(accounts).values(tables.accounts);
  // Parents first: categories reference themselves.
  const parents = (tables.categories ?? []).filter((row) => !row.parentId);
  const children = (tables.categories ?? []).filter((row) => row.parentId);
  if (parents.length) await db.insert(categories).values(parents);
  if (children.length) await db.insert(categories).values(children);
  if (tables.incomeSources?.length) await db.insert(incomeSources).values(tables.incomeSources);
  if (tables.transactions?.length) await db.insert(transactions).values(tables.transactions);
  if (tables.budgets?.length) await db.insert(budgets).values(tables.budgets);
  if (tables.plannedPayments?.length) {
    await db.insert(plannedPayments).values(tables.plannedPayments);
  }
  if (tables.settings?.length) await db.insert(settings).values(tables.settings);
}

// ---- lenient record import -------------------------------------------------

export interface RecordImportRow {
  type: TransactionType;
  /** Major units (pesos). Sign is ignored; `type` decides direction. */
  amount: number;
  date: string;
  /** Category slug or name. Unknown values land as uncategorized. */
  category?: string | null;
  /** Account slug or name. Falls back to the first account. */
  account?: string | null;
  /** Income source slug or name. */
  source?: string | null;
  payee?: string | null;
  note?: string | null;
}

export interface RecordsPayload {
  format: typeof RECORDS_FORMAT;
  version: 1;
  records: RecordImportRow[];
}

export interface ImportSummary {
  inserted: number;
  skipped: number;
  unresolvedCategories: string[];
}

/**
 * Import plain records - the shape a spreadsheet export lands in. Everything is
 * resolved by slug or name rather than id, so the file does not need to know
 * anything about this database.
 */
export async function importRecords(db: Database, payload: unknown): Promise<ImportSummary> {
  const candidate = payload as Partial<RecordsPayload>;
  if (!candidate || candidate.format !== RECORDS_FORMAT || !Array.isArray(candidate.records)) {
    throw new Error("Not an adVantage records file");
  }

  const [accountRows, categoryRows, sourceRows] = await Promise.all([
    db.select().from(accounts),
    db.select().from(categories),
    db.select().from(incomeSources),
  ]);

  const key = (value: string) => value.trim().toLowerCase();
  const accountIndex = new Map<string, string>();
  for (const row of accountRows) {
    if (row.slug) accountIndex.set(key(row.slug), row.id);
    accountIndex.set(key(row.name), row.id);
  }
  const categoryIndex = new Map<string, string>();
  for (const row of categoryRows) {
    if (row.slug) categoryIndex.set(key(row.slug), row.id);
    categoryIndex.set(key(row.name), row.id);
  }
  const sourceIndex = new Map<string, string>();
  for (const row of sourceRows) {
    sourceIndex.set(key(row.slug), row.id);
    sourceIndex.set(key(row.name), row.id);
    sourceIndex.set(key(row.shortName), row.id);
  }

  const fallbackAccount = accountRows[0]?.id;
  if (!fallbackAccount) throw new Error("Create an account before importing records");

  const summary: ImportSummary = { inserted: 0, skipped: 0, unresolvedCategories: [] };
  const unresolved = new Set<string>();

  for (const record of candidate.records) {
    if (!record?.date || !Number.isFinite(record.amount)) {
      summary.skipped += 1;
      continue;
    }

    const categoryId = record.category ? categoryIndex.get(key(record.category)) : undefined;
    if (record.category && !categoryId) unresolved.add(record.category);

    await createTransaction(db, {
      type: record.type,
      amountMinor: Math.abs(toMinor(record.amount)),
      date: record.date,
      accountId: (record.account ? accountIndex.get(key(record.account)) : undefined) ?? fallbackAccount,
      categoryId: categoryId ?? null,
      incomeSourceId: (record.source ? sourceIndex.get(key(record.source)) : undefined) ?? null,
      payee: record.payee ?? null,
      note: record.note ?? null,
    });

    summary.inserted += 1;
  }

  summary.unresolvedCategories = [...unresolved];
  return summary;
}


// ---- plan import -----------------------------------------------------------

export interface PlanItem {
  name: string;
  type: "expense" | "income";
  /** Major units. Always a magnitude; `type` carries the direction. */
  amount: number;
  /** The first (or only) date it lands. */
  date: string;
  frequency: Frequency;
  /** Last date the schedule may produce, for a series that ends. */
  endDate?: string | null;
  category?: string | null;
  account?: string | null;
  source?: string | null;
  note?: string | null;
}

/**
 * An account the plan expects to exist. Matched by slug, so importing twice
 * updates rather than duplicates - and so a renamed account keeps its identity.
 */
export interface PlanAccount {
  slug: string;
  name: string;
  type: AccountType;
  icon?: string;
  /** Major units. What the account held when it was last counted. */
  openingBalance?: number;
  excludeFromTotals?: boolean;
}

export interface PlanPayload {
  format: typeof PLAN_FORMAT;
  version: 1;
  name?: string;
  preparedOn?: string;
  /** Wipe the existing schedule first. A plan file is a complete schedule. */
  replaceExisting?: boolean;
  accounts?: PlanAccount[];
  planned: PlanItem[];
}

export interface PlanImportSummary {
  created: number;
  removed: number;
  skipped: number;
  accountsCreated: number;
  accountsUpdated: number;
  unresolvedCategories: string[];
  unresolvedAccounts: string[];
}

/**
 * Load a dated schedule of future obligations.
 *
 * These are deliberately planned payments rather than transactions: nothing
 * here has happened yet, and a future-dated transaction would land in account
 * balances and net worth today, reporting money that has not moved. Each item
 * waits on the Planned screen until it is logged.
 */
export async function importPlan(db: Database, payload: unknown): Promise<PlanImportSummary> {
  const candidate = payload as Partial<PlanPayload>;
  if (!candidate || candidate.format !== PLAN_FORMAT || !Array.isArray(candidate.planned)) {
    throw new Error("Not an adVantage plan file");
  }

  const key = (value: string) => value.trim().toLowerCase();
  const now = new Date().toISOString();

  const summary: PlanImportSummary = {
    created: 0,
    removed: 0,
    skipped: 0,
    accountsCreated: 0,
    accountsUpdated: 0,
    unresolvedCategories: [],
    unresolvedAccounts: [],
  };

  // Accounts first: the schedule below points at them.
  for (const account of candidate.accounts ?? []) {
    if (!account?.slug || !account.name) continue;

    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.slug, account.slug))
      .limit(1);

    const patch = {
      name: account.name,
      type: account.type,
      icon: account.icon ?? "Wallet",
      openingBalanceMinor: toMinor(account.openingBalance ?? 0),
      excludeFromTotals: account.excludeFromTotals ?? false,
      archivedAt: null,
    };

    if (existing[0]) {
      await db.update(accounts).set(patch).where(eq(accounts.id, existing[0].id));
      summary.accountsUpdated += 1;
    } else {
      await db
        .insert(accounts)
        .values({ ...patch, id: crypto.randomUUID(), slug: account.slug, createdAt: now });
      summary.accountsCreated += 1;
    }
  }

  const [accountRows, categoryRows, sourceRows] = await Promise.all([
    db.select().from(accounts),
    db.select().from(categories),
    db.select().from(incomeSources),
  ]);

  const accountIndex = new Map<string, string>();
  for (const row of accountRows) {
    if (row.slug) accountIndex.set(key(row.slug), row.id);
    accountIndex.set(key(row.name), row.id);
  }
  const categoryIndex = new Map<string, string>();
  for (const row of categoryRows) {
    if (row.slug) categoryIndex.set(key(row.slug), row.id);
    categoryIndex.set(key(row.name), row.id);
  }
  const sourceIndex = new Map<string, string>();
  for (const row of sourceRows) {
    sourceIndex.set(key(row.slug), row.id);
    sourceIndex.set(key(row.name), row.id);
    sourceIndex.set(key(row.shortName), row.id);
  }

  const fallbackAccount = accountRows[0]?.id;
  if (!fallbackAccount) throw new Error("Create an account before importing a plan");

  if (candidate.replaceExisting) {
    const existing = await db.select({ id: plannedPayments.id }).from(plannedPayments);
    summary.removed = existing.length;
    await db.delete(plannedPayments);
  }

  const missingCategories = new Set<string>();
  const missingAccounts = new Set<string>();

  for (const item of candidate.planned) {
    if (!item?.name || !item.date || !Number.isFinite(item.amount)) {
      summary.skipped += 1;
      continue;
    }

    const categoryId = item.category ? categoryIndex.get(key(item.category)) : undefined;
    if (item.category && !categoryId) missingCategories.add(item.category);

    const accountId = item.account ? accountIndex.get(key(item.account)) : undefined;
    if (item.account && !accountId) missingAccounts.add(item.account);

    await db.insert(plannedPayments).values({
      id: crypto.randomUUID(),
      name: item.name,
      type: item.type,
      amountMinor: Math.abs(toMinor(item.amount)),
      frequency: item.frequency,
      anchorDate: item.date,
      endDate: item.endDate ?? null,
      accountId: accountId ?? fallbackAccount,
      categoryId: categoryId ?? null,
      incomeSourceId: (item.source ? sourceIndex.get(key(item.source)) : undefined) ?? null,
      note: item.note ?? null,
      active: true,
      createdAt: now,
    });

    summary.created += 1;
  }

  summary.unresolvedCategories = [...missingCategories];
  summary.unresolvedAccounts = [...missingAccounts];
  return summary;
}
