import type {
  Category,
  CategoryInput,
  CategoryNode,
  CategoryOption,
  CategoryPatch,
} from "@advantage/api-client/types";
import type { CategoryKind } from "@advantage/core";
import { randomUUID } from "node:crypto";

import type { Tenant } from "../db/tenant";
import { toCategory } from "./mappers";

export async function listCategories(
  tenant: Tenant,
  options: { kind?: CategoryKind; includeArchived?: boolean } = {},
): Promise<Category[]> {
  const rows = await tenant.db.category.findMany({
    where: {
      userId: tenant.userId,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toCategory);
}

/** Two-level tree plus a usage count, which is what every category screen needs. */
export async function listCategoryTree(
  tenant: Tenant,
  options: { kind?: CategoryKind } = {},
): Promise<CategoryNode[]> {
  const [rows, usage] = await Promise.all([
    listCategories(tenant, options),
    tenant.db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId: tenant.userId },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(
    usage.filter((row) => row.categoryId).map((row) => [row.categoryId!, row._count._all]),
  );

  const byParent = new Map<string, Category[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const bucket = byParent.get(row.parentId) ?? [];
    bucket.push(row);
    byParent.set(row.parentId, bucket);
  }

  return rows
    .filter((row) => !row.parentId)
    .map((parent) => {
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
export async function listCategoryOptions(
  tenant: Tenant,
  kind: CategoryKind,
): Promise<CategoryOption[]> {
  const rows = await listCategories(tenant, { kind });
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
  tenant: Tenant,
  input: CategoryInput & { id?: string },
): Promise<string> {
  const id = input.id ?? randomUUID();
  await tenant.db.category.create({
    data: {
      id,
      userId: tenant.userId,
      slug: input.slug ?? null,
      name: input.name,
      kind: input.kind,
      icon: input.icon,
      color: input.color ?? null,
      parentId: input.parentId ?? null,
      isSystem: input.isSystem,
      sortOrder: input.sortOrder,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    },
  });
  return id;
}

export async function updateCategory(
  tenant: Tenant,
  id: string,
  patch: CategoryPatch,
): Promise<void> {
  await tenant.db.category.updateMany({
    where: { id, userId: tenant.userId },
    data: patch,
  });
}

/** Archiving a group takes its subcategories with it. */
export async function archiveCategory(tenant: Tenant, id: string): Promise<void> {
  const now = new Date().toISOString();
  await tenant.db.category.updateMany({
    where: { userId: tenant.userId, OR: [{ id }, { parentId: id }] },
    data: { archivedAt: now },
  });
}
