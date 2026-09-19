import { DEFAULT_SETTINGS, type AppSettings } from "@advantage/core";
import { asc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  accounts,
  budgets,
  categories,
  incomeSources,
  plannedPayments,
  settings,
  transactions,
  type IncomeSource,
  type NewIncomeSource,
} from "../schema";

/** Settings live as key/value rows so adding one never needs a migration. */
export async function readSettings(db: Database): Promise<AppSettings> {
  const rows = await db.select().from(settings);
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

export async function writeSettings(db: Database, patch: Partial<AppSettings>): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  for (const [key, value] of entries) {
    await db
      .insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } });
  }
}

// ---- income sources --------------------------------------------------------

export async function listIncomeSources(
  db: Database,
  options: { includeArchived?: boolean } = {},
): Promise<IncomeSource[]> {
  return db
    .select()
    .from(incomeSources)
    .where(options.includeArchived ? undefined : isNull(incomeSources.archivedAt))
    .orderBy(asc(incomeSources.sortOrder), asc(incomeSources.name));
}

export async function updateIncomeSource(
  db: Database,
  id: string,
  patch: Partial<Omit<NewIncomeSource, "id" | "createdAt">>,
): Promise<void> {
  await db.update(incomeSources).set(patch).where(eq(incomeSources.id, id));
}

/** Row counts per table - the Settings page shows these before a reset. */
export async function databaseStats(db: Database): Promise<Record<string, number>> {
  const tables = {
    transactions,
    accounts,
    categories,
    budgets,
    planned: plannedPayments,
    incomeSources,
  };

  const stats: Record<string, number> = {};
  for (const [label, table] of Object.entries(tables)) {
    const rows = await db.select({ total: sql<number>`COUNT(*)` }).from(table);
    stats[label] = Number(rows[0]?.total ?? 0);
  }
  return stats;
}
