import {
  BACKUP_FORMAT,
  PLAN_FORMAT,
  RECORDS_FORMAT,
  type BackupPayload,
  type ImportSummary,
  type PlanImportSummary,
  type PlanPayload,
  type RecordsPayload,
} from "@advantage/api-client/types";
import { toMinor } from "@advantage/core";
import { randomUUID } from "node:crypto";

import { transact, type Tenant } from "../db/tenant";
import { ApiError } from "../errors";
import {
  toAccount,
  toBudget,
  toCategory,
  toIncomeSource,
  toPlannedPayment,
  toSetting,
  toTransaction,
} from "./mappers";
import { createTransaction } from "./transactions";

/**
 * Full-fidelity dump: ids intact, so a restore is the same ledger. The shape is
 * unchanged from the local-first build, which means a backup downloaded from
 * the SQLite version imports here without translation - and it is the file that
 * makes you user number one.
 */
export async function exportBackup(tenant: Tenant): Promise<BackupPayload> {
  const where = { userId: tenant.userId };

  const [accounts, categories, incomeSources, transactions, budgets, planned, settings] =
    await Promise.all([
      tenant.db.account.findMany({ where }),
      tenant.db.category.findMany({ where }),
      tenant.db.incomeSource.findMany({ where }),
      tenant.db.transaction.findMany({ where }),
      tenant.db.budget.findMany({ where }),
      tenant.db.plannedPayment.findMany({ where }),
      tenant.db.setting.findMany({ where }),
    ]);

  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      accounts: accounts.map(toAccount),
      categories: categories.map(toCategory),
      incomeSources: incomeSources.map(toIncomeSource),
      transactions: transactions.map(toTransaction),
      budgets: budgets.map(toBudget),
      plannedPayments: planned.map(toPlannedPayment),
      settings: settings.map(toSetting),
    },
  };
}

function assertBackup(payload: unknown): asserts payload is BackupPayload {
  const candidate = payload as Partial<BackupPayload>;
  if (!candidate || candidate.format !== BACKUP_FORMAT) {
    throw ApiError.badRequest("Not an adVantage backup file");
  }
  if (candidate.version !== 1) {
    throw ApiError.badRequest(`Unsupported backup version: ${String(candidate.version)}`);
  }
  if (!candidate.tables) throw ApiError.badRequest("Backup file has no tables");
}

/**
 * Delete this user's ledger. Every clause names the user.
 *
 * On a single-user local database "delete everything" was a truthful
 * description of what a restore does first. With other people's records in the
 * same tables it would be a cross-tenant wipe triggered by a file upload, so
 * the scoping here is the point of the function, not an implementation detail.
 */
async function clearLedger(tenant: Tenant): Promise<void> {
  const where = { userId: tenant.userId };

  // Children before parents: transactions point at planned payments, budgets
  // and planned payments point at categories and accounts.
  await tenant.db.transaction.deleteMany({ where });
  await tenant.db.budget.deleteMany({ where });
  await tenant.db.plannedPayment.deleteMany({ where });
  await tenant.db.setting.deleteMany({ where });
  await tenant.db.incomeSource.deleteMany({ where });
  await tenant.db.category.deleteMany({ where });
  await tenant.db.account.deleteMany({ where });
}

/** Replaces everything this user has. Runs as one transaction, so a bad file leaves the ledger untouched. */
export async function importBackup(tenant: Tenant, payload: unknown): Promise<void> {
  assertBackup(payload);
  const { tables } = payload;

  await transact(tenant, async (t) => {
    const userId = t.userId;
    await clearLedger(t);

    if (tables.accounts?.length) {
      await t.db.account.createMany({
        data: tables.accounts.map((row) => ({ ...row, userId })),
      });
    }

    // Parents first: categories reference themselves.
    const categories = tables.categories ?? [];
    const parents = categories.filter((row) => !row.parentId);
    const children = categories.filter((row) => row.parentId);
    if (parents.length) {
      await t.db.category.createMany({ data: parents.map((row) => ({ ...row, userId })) });
    }
    if (children.length) {
      await t.db.category.createMany({ data: children.map((row) => ({ ...row, userId })) });
    }

    if (tables.incomeSources?.length) {
      await t.db.incomeSource.createMany({
        data: tables.incomeSources.map((row) => ({ ...row, userId })),
      });
    }

    // Before transactions, which carry a plannedPaymentId. SQLite let that
    // dangle; Postgres does not.
    if (tables.plannedPayments?.length) {
      await t.db.plannedPayment.createMany({
        data: tables.plannedPayments.map((row) => ({ ...row, userId })),
      });
    }

    if (tables.transactions?.length) {
      await t.db.transaction.createMany({
        data: tables.transactions.map((row) => ({ ...row, userId })),
      });
    }

    if (tables.budgets?.length) {
      await t.db.budget.createMany({
        data: tables.budgets.map((row) => ({ ...row, userId })),
      });
    }

    if (tables.settings?.length) {
      await t.db.setting.createMany({
        data: tables.settings.map((row) => ({ ...row, userId })),
      });
    }
  });
}

/**
 * Erase this user's ledger without putting anything back. The next request
 * finds an empty categories table and seeds a fresh one, which is exactly what
 * "erase everything" did when the database was a file in the browser.
 */
export async function resetLedger(tenant: Tenant): Promise<void> {
  await transact(tenant, clearLedger);
}

// ---- lenient record import -------------------------------------------------

/** Slug or visible name, case- and space-insensitive. */
const key = (value: string) => value.trim().toLowerCase();

interface Lookups {
  accounts: Map<string, string>;
  categories: Map<string, string>;
  sources: Map<string, string>;
  fallbackAccount: string | undefined;
}

async function buildLookups(tenant: Tenant): Promise<Lookups> {
  const where = { userId: tenant.userId };
  const [accounts, categories, sources] = await Promise.all([
    tenant.db.account.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    tenant.db.category.findMany({ where }),
    tenant.db.incomeSource.findMany({ where }),
  ]);

  const accountIndex = new Map<string, string>();
  for (const row of accounts) {
    if (row.slug) accountIndex.set(key(row.slug), row.id);
    accountIndex.set(key(row.name), row.id);
  }
  const categoryIndex = new Map<string, string>();
  for (const row of categories) {
    if (row.slug) categoryIndex.set(key(row.slug), row.id);
    categoryIndex.set(key(row.name), row.id);
  }
  const sourceIndex = new Map<string, string>();
  for (const row of sources) {
    sourceIndex.set(key(row.slug), row.id);
    sourceIndex.set(key(row.name), row.id);
    sourceIndex.set(key(row.shortName), row.id);
  }

  return {
    accounts: accountIndex,
    categories: categoryIndex,
    sources: sourceIndex,
    fallbackAccount: accounts[0]?.id,
  };
}

/**
 * Import plain records - the shape a spreadsheet export lands in. Everything is
 * resolved by slug or name rather than id, so the file does not need to know
 * anything about this database.
 */
export async function importRecords(tenant: Tenant, payload: unknown): Promise<ImportSummary> {
  const candidate = payload as Partial<RecordsPayload>;
  if (!candidate || candidate.format !== RECORDS_FORMAT || !Array.isArray(candidate.records)) {
    throw ApiError.badRequest("Not an adVantage records file");
  }

  return transact(tenant, async (t) => {
    const lookups = await buildLookups(t);
    if (!lookups.fallbackAccount) {
      throw ApiError.badRequest("Create an account before importing records");
    }

    const summary: ImportSummary = { inserted: 0, skipped: 0, unresolvedCategories: [] };
    const unresolved = new Set<string>();

    for (const record of candidate.records ?? []) {
      if (!record?.date || !Number.isFinite(record.amount)) {
        summary.skipped += 1;
        continue;
      }

      const categoryId = record.category ? lookups.categories.get(key(record.category)) : undefined;
      if (record.category && !categoryId) unresolved.add(record.category);

      await createTransaction(t, {
        type: record.type,
        amountMinor: Math.abs(toMinor(record.amount)),
        date: record.date,
        accountId:
          (record.account ? lookups.accounts.get(key(record.account)) : undefined) ??
          lookups.fallbackAccount,
        toAccountId: null,
        categoryId: categoryId ?? null,
        incomeSourceId:
          (record.source ? lookups.sources.get(key(record.source)) : undefined) ?? null,
        payee: record.payee ?? null,
        note: record.note ?? null,
        plannedPaymentId: null,
      });

      summary.inserted += 1;
    }

    summary.unresolvedCategories = [...unresolved];
    return summary;
  });
}

// ---- plan import -----------------------------------------------------------

/**
 * Load a dated schedule of future obligations.
 *
 * These are deliberately planned payments rather than transactions: nothing
 * here has happened yet, and a future-dated transaction would land in account
 * balances and net worth today, reporting money that has not moved. Each item
 * waits on the Planned screen until it is logged.
 */
export async function importPlan(tenant: Tenant, payload: unknown): Promise<PlanImportSummary> {
  const candidate = payload as Partial<PlanPayload>;
  if (!candidate || candidate.format !== PLAN_FORMAT || !Array.isArray(candidate.planned)) {
    throw ApiError.badRequest("Not an adVantage plan file");
  }

  return transact(tenant, async (t) => {
    const userId = t.userId;
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

      const patch = {
        name: account.name,
        type: account.type,
        icon: account.icon ?? "Wallet",
        openingBalanceMinor: toMinor(account.openingBalance ?? 0),
        excludeFromTotals: account.excludeFromTotals ?? false,
        archivedAt: null,
      };

      const existing = await t.db.account.findFirst({
        where: { userId, slug: account.slug },
        select: { id: true },
      });

      if (existing) {
        await t.db.account.updateMany({ where: { id: existing.id, userId }, data: patch });
        summary.accountsUpdated += 1;
      } else {
        await t.db.account.create({
          data: { ...patch, id: randomUUID(), userId, slug: account.slug, createdAt: now },
        });
        summary.accountsCreated += 1;
      }
    }

    const lookups = await buildLookups(t);
    if (!lookups.fallbackAccount) {
      throw ApiError.badRequest("Create an account before importing a plan");
    }

    if (candidate.replaceExisting) {
      // A plan file is a complete schedule, so the old one goes. The records
      // already posted from it stay - those happened.
      const { count } = await t.db.plannedPayment.deleteMany({ where: { userId } });
      summary.removed = count;
    }

    const missingCategories = new Set<string>();
    const missingAccounts = new Set<string>();
    const rows = [];

    for (const item of candidate.planned ?? []) {
      if (!item?.name || !item.date || !Number.isFinite(item.amount)) {
        summary.skipped += 1;
        continue;
      }

      const categoryId = item.category ? lookups.categories.get(key(item.category)) : undefined;
      if (item.category && !categoryId) missingCategories.add(item.category);

      const accountId = item.account ? lookups.accounts.get(key(item.account)) : undefined;
      if (item.account && !accountId) missingAccounts.add(item.account);

      rows.push({
        id: randomUUID(),
        userId,
        name: item.name,
        type: item.type,
        amountMinor: Math.abs(toMinor(item.amount)),
        frequency: item.frequency,
        anchorDate: item.date,
        endDate: item.endDate ?? null,
        accountId: accountId ?? lookups.fallbackAccount,
        categoryId: categoryId ?? null,
        incomeSourceId: (item.source ? lookups.sources.get(key(item.source)) : undefined) ?? null,
        note: item.note ?? null,
        active: true,
        createdAt: now,
      });
    }

    if (rows.length) await t.db.plannedPayment.createMany({ data: rows });
    summary.created = rows.length;
    summary.unresolvedCategories = [...missingCategories];
    summary.unresolvedAccounts = [...missingAccounts];
    return summary;
  });
}
