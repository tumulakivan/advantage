import type { CatalogEntry, CatalogEntryInput, CatalogEntryPatch } from "@advantage/api-client/types";
import type { AccountType } from "@advantage/core";
import type { AccountCatalogEntry } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../db/client";
import { ApiError } from "../errors";
import { assertSquare, decodeUpload, describeImage, toStorableBytes } from "../images";

/**
 * The shared account catalog.
 *
 * These functions take the raw client rather than a tenant handle, and they are
 * the only ones in the codebase that do. The catalog belongs to no one: it is
 * brand assets, readable by every signed-in user and writable only by an admin,
 * so scoping it to a user would be meaningless rather than merely redundant.
 * The route layer is where that difference is enforced.
 */

export function toCatalogEntry(row: AccountCatalogEntry): CatalogEntry {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type as AccountType,
    icon: row.icon,
    // The version is what makes a replaced logo actually replace the cached one.
    logoUrl: row.logoVersion ? `/api/catalog/${row.slug}/logo?v=${row.logoVersion}` : null,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
  };
}

/** What a user can choose from. Archived entries stay out of it. */
export async function listCatalog(
  options: { includeArchived?: boolean } = {},
): Promise<CatalogEntry[]> {
  const rows = await prisma.accountCatalogEntry.findMany({
    where: options.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toCatalogEntry);
}

/** Slug to logo URL, for decorating a user's own accounts. */
export async function logoIndex(): Promise<Map<string, string>> {
  const rows = await prisma.accountCatalogEntry.findMany({
    where: { logoVersion: { not: null } },
    select: { slug: true, logoVersion: true },
  });

  return new Map(
    rows.map((row) => [row.slug, `/api/catalog/${row.slug}/logo?v=${row.logoVersion}`]),
  );
}

export async function readLogo(
  slug: string,
): Promise<{ bytes: Buffer; type: string; version: string } | null> {
  const row = await prisma.accountCatalogEntry.findUnique({
    where: { slug },
    select: { logoData: true, logoType: true, logoVersion: true },
  });

  if (!row?.logoData || !row.logoType || !row.logoVersion) return null;
  return {
    bytes: Buffer.from(row.logoData),
    type: row.logoType,
    version: row.logoVersion,
  };
}

// ---- admin writes -----------------------------------------------------------

/** `GCash Business` -> `gcash-business`. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!slug) throw ApiError.badRequest("That name has no letters or digits in it.");
  return slug;
}

export async function createCatalogEntry(input: CatalogEntryInput): Promise<CatalogEntry> {
  const slug = input.slug?.trim() || slugify(input.name);

  const clash = await prisma.accountCatalogEntry.findUnique({ where: { slug } });
  if (clash) throw ApiError.conflict(`The catalog already has "${clash.name}".`);

  const now = new Date().toISOString();
  const logo = input.logo ? prepareLogo(input.logo) : null;

  const row = await prisma.accountCatalogEntry.create({
    data: {
      id: randomUUID(),
      slug,
      name: input.name.trim(),
      type: input.type,
      icon: input.icon,
      sortOrder: input.sortOrder ?? 100,
      ...(logo ?? {}),
      createdAt: now,
      updatedAt: now,
    },
  });

  return toCatalogEntry(row);
}

export async function updateCatalogEntry(
  id: string,
  patch: CatalogEntryPatch,
): Promise<CatalogEntry> {
  const existing = await prisma.accountCatalogEntry.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("No such catalog entry.");

  // `logo: null` means remove it; omitting the field means leave it alone.
  const logo =
    patch.logo === undefined
      ? {}
      : patch.logo === null
        ? { logoData: null, logoType: null, logoVersion: null }
        : prepareLogo(patch.logo);

  const row = await prisma.accountCatalogEntry.update({
    where: { id },
    data: {
      ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
      ...(patch.type === undefined ? {} : { type: patch.type }),
      ...(patch.icon === undefined ? {} : { icon: patch.icon }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      ...(patch.archivedAt === undefined ? {} : { archivedAt: patch.archivedAt }),
      ...logo,
      updatedAt: new Date().toISOString(),
    },
  });

  return toCatalogEntry(row);
}

/**
 * Archive rather than delete. Someone's wallet may already carry this slug, and
 * removing the row would take the logo off an account they are still using.
 */
export async function archiveCatalogEntry(id: string, archived: boolean): Promise<CatalogEntry> {
  return updateCatalogEntry(id, { archivedAt: archived ? new Date().toISOString() : null });
}

function prepareLogo(upload: string) {
  const bytes = decodeUpload(upload);
  const info = describeImage(bytes);
  assertSquare(info);

  return {
    logoData: toStorableBytes(bytes),
    logoType: info.type,
    logoVersion: randomUUID().slice(0, 8),
  };
}
