import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { CategoryKind } from "@advantage/core";

import type { Database } from "../client";
import { categories, transactions, type Category, type NewCategory } from "../schema";

export interface CategoryNode extends Category {
  children: Category[];
  /** Resolved hue: a child inherits its parent slot. */
  effectiveColor: string | null;
  usageCount: number;
}

export async function listCategories(
  db: Database,
  options: { kind?: CategoryKind; includeArchived?: boolean } = {},
): Promise<Category[]> {
  const filters = [
    options.kind ? eq(categories.kind, options.kind) : undefined,
    options.includeArchived ? undefined : isNull(categories.archivedAt),
  ].filter(Boolean);

  return db
    .select()
    .from(categories)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/** Two-level tree plus a usage count, which is what every category screen needs. */
export async function listCategoryTree(
  db: Database,
  options: { kind?: CategoryKind } = {},
): Promise<CategoryNode[]> {
  const rows = await listCategories(db, options);
  const usage = await db
    .select({
      categoryId: transactions.categoryId,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .groupBy(transactions.categoryId);

  const counts = new Map(usage.map((row) => [row.categoryId, Number(row.count ?? 0)]));
  const parents = rows.filter((row) => !row.parentId);
  const byParent = new Map<string, Category[]>();

  for (const row of rows) {
    if (!row.parentId) continue;
    const bucket = byParent.get(row.parentId) ?? [];
    bucket.push(row);
    byParent.set(row.parentId, bucket);
  }

  return parents.map((parent) => {
    const children = byParent.get(parent.id) ?? [];
    const childUsage = children.reduce((sum, child) => sum + (counts.get(child.id) ?? 0), 0);
    return {
      ...parent,
      children,
      effectiveColor: parent.color,
      usageCount: (counts.get(parent.id) ?? 0) + childUsage,
    };
  });
}

/** Flat list for a picker: parents with their children indented beneath them. */
export interface CategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  parentId: string | null;
  parentName: string | null;
  depth: 0 | 1;
}

export async function listCategoryOptions(
  db: Database,
  kind: CategoryKind,
): Promise<CategoryOption[]> {
  const rows = await listCategories(db, { kind });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const options: CategoryOption[] = [];

  for (const parent of rows.filter((row) => !row.parentId)) {
    options.push({
      id: parent.id,
      name: parent.name,
      icon: parent.icon,
      color: parent.color,
      parentId: null,
      parentName: null,
      depth: 0,
    });

    for (const child of rows.filter((row) => row.parentId === parent.id)) {
      options.push({
        id: child.id,
        name: child.name,
        icon: child.icon,
        color: child.color ?? byId.get(child.parentId ?? "")?.color ?? null,
        parentId: parent.id,
        parentName: parent.name,
        depth: 1,
      });
    }
  }

  return options;
}

export async function createCategory(
  db: Database,
  input: Omit<NewCategory, "id" | "createdAt">,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(categories).values({ ...input, id, createdAt: new Date().toISOString() });
  return id;
}

export async function updateCategory(
  db: Database,
  id: string,
  patch: Partial<Omit<NewCategory, "id" | "createdAt">>,
): Promise<void> {
  await db.update(categories).set(patch).where(eq(categories.id, id));
}

export async function archiveCategory(db: Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(categories).set({ archivedAt: now }).where(eq(categories.id, id));
  await db.update(categories).set({ archivedAt: now }).where(eq(categories.parentId, id));
}
