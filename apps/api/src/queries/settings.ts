import type {
  AppSettings,
  DatabaseStats,
  IncomeSource,
  IncomeSourceInput,
  IncomeSourcePatch,
} from "@advantage/api-client/types";
import { DEFAULT_SETTINGS } from "@advantage/core";
import { randomUUID } from "node:crypto";

import type { Tenant } from "../db/tenant";
import { ApiError } from "../errors";
import { toIncomeSource } from "./mappers";

/** Settings live as key/value rows so adding one never needs a migration. */
export async function readSettings(tenant: Tenant): Promise<AppSettings> {
  const rows = await tenant.db.setting.findMany({ where: { userId: tenant.userId } });
  const map = new Map(rows.map((row) => [row.key, row.value]));

  const monthStartDay = Number(map.get("monthStartDay"));
  const theme = map.get("theme");

  return {
    currency: map.get("currency") ?? DEFAULT_SETTINGS.currency,
    locale: map.get("locale") ?? DEFAULT_SETTINGS.locale,
    monthStartDay: Number.isFinite(monthStartDay) ? monthStartDay : DEFAULT_SETTINGS.monthStartDay,
    theme: theme === "light" ? "light" : "dark",
  };
}

export async function writeSettings(
  tenant: Tenant,
  patch: Partial<AppSettings>,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  for (const [key, value] of entries) {
    await tenant.db.setting.upsert({
      where: { userId_key: { userId: tenant.userId, key } },
      create: { userId: tenant.userId, key, value: String(value) },
      update: { value: String(value) },
    });
  }
}

// ---- income sources --------------------------------------------------------

export async function listIncomeSources(
  tenant: Tenant,
  options: { includeArchived?: boolean } = {},
): Promise<IncomeSource[]> {
  const rows = await tenant.db.incomeSource.findMany({
    where: {
      userId: tenant.userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toIncomeSource);
}

/**
 * Add a payer. Sources are rows rather than an enum precisely so that everyone
 * can describe their own arrangement - one employer, three clients, a rental -
 * without anybody needing a migration.
 */
export async function createIncomeSource(
  tenant: Tenant,
  input: IncomeSourceInput,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw ApiError.badRequest("An income source needs a name.");

  const id = randomUUID();
  const existing = await tenant.db.incomeSource.findMany({
    where: { userId: tenant.userId },
    select: { slug: true, sortOrder: true },
  });

  const taken = new Set(existing.map((row) => row.slug));
  const nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  await tenant.db.incomeSource.create({
    data: {
      id,
      userId: tenant.userId,
      slug: uniqueSlug(name, taken),
      name,
      shortName: (input.shortName?.trim() || name).slice(0, 60),
      // Rotate through the chart slots, so a new source is distinguishable
      // from the others without anyone being asked to pick a colour.
      color: input.color ?? `chart-${(nextOrder % 7) + 1}`,
      defaultCategoryId: input.defaultCategoryId ?? null,
      defaultAccountId: input.defaultAccountId ?? null,
      sortOrder: nextOrder,
      createdAt: new Date().toISOString(),
    },
  });

  return id;
}

export async function updateIncomeSource(
  tenant: Tenant,
  id: string,
  patch: IncomeSourcePatch,
): Promise<void> {
  await tenant.db.incomeSource.updateMany({
    where: { id, userId: tenant.userId },
    data: patch,
  });
}

/**
 * Soft delete, like every other label a record can point at. Income already
 * logged against this source keeps saying where it came from.
 */
export async function archiveIncomeSource(tenant: Tenant, id: string): Promise<void> {
  await tenant.db.incomeSource.updateMany({
    where: { id, userId: tenant.userId },
    data: { archivedAt: new Date().toISOString() },
  });
}

export async function restoreIncomeSource(tenant: Tenant, id: string): Promise<void> {
  await tenant.db.incomeSource.updateMany({
    where: { id, userId: tenant.userId },
    data: { archivedAt: null },
  });
}

/** `Acme Corp` -> `acme-corp`, `acme-corp-2` if that is taken. */
function uniqueSlug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "source";

  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Row counts per table - the Settings page shows these before a reset. */
export async function databaseStats(tenant: Tenant): Promise<DatabaseStats> {
  const where = { userId: tenant.userId };

  const [transactions, accounts, categories, budgets, planned, incomeSources] = await Promise.all([
    tenant.db.transaction.count({ where }),
    tenant.db.account.count({ where }),
    tenant.db.category.count({ where }),
    tenant.db.budget.count({ where }),
    tenant.db.plannedPayment.count({ where }),
    tenant.db.incomeSource.count({ where }),
  ]);

  return { transactions, accounts, categories, budgets, planned, incomeSources };
}
