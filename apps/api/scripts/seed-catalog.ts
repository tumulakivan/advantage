import { SEED_ACCOUNT_CATALOG } from "@advantage/core";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { disconnect, prisma } from "../src/db/client";
import { assertSquare, describeImage, toStorableBytes } from "../src/images";

/**
 * Fill the shared account catalog, logos and all.
 *
 *   npm run db:seed:catalog -w @advantage/api
 *
 * The images come from `icons/` at the repo root - the same files the web app
 * used to bundle. Moving them into the database is the whole point of the
 * catalog: a logo becomes something an admin can add without a deploy, rather
 * than an import statement only a developer can write.
 *
 * Idempotent. Entries that already exist keep the name and logo an admin has
 * since given them; only genuinely new slugs are inserted. Re-running it after
 * adding a file to `icons/` therefore fills the gap without undoing any
 * curation, and `--force-logos` is there for when that is what you actually
 * want.
 */
const forceLogos = process.argv.includes("--force-logos");
const iconsDir = resolve(import.meta.dirname, "../../../icons");

let created = 0;
let updated = 0;
let skipped = 0;

for (const [index, entry] of SEED_ACCOUNT_CATALOG.entries()) {
  const existing = await prisma.accountCatalogEntry.findUnique({ where: { slug: entry.slug } });

  if (existing && !forceLogos) {
    skipped += 1;
    continue;
  }

  const logo = await loadLogo(entry.logoFile);
  const now = new Date().toISOString();

  if (existing) {
    // --force-logos: put the shipped artwork back, leave the naming alone.
    await prisma.accountCatalogEntry.update({
      where: { id: existing.id },
      data: { ...(logo ?? {}), updatedAt: now },
    });
    updated += 1;
    console.log(`  reset logo  ${entry.slug}`);
    continue;
  }

  await prisma.accountCatalogEntry.create({
    data: {
      id: randomUUID(),
      slug: entry.slug,
      name: entry.name,
      type: entry.type,
      icon: entry.icon,
      sortOrder: index,
      ...(logo ?? {}),
      createdAt: now,
      updatedAt: now,
    },
  });
  created += 1;
  console.log(`  added       ${entry.slug}${logo ? " (with logo)" : ""}`);
}

const total = await prisma.accountCatalogEntry.count();
console.log(
  `\nCatalog: ${created} added, ${updated} logos reset, ${skipped} left alone - ${total} entries.`,
);

await disconnect();

async function loadLogo(file: string | undefined) {
  if (!file) return null;

  const path = resolve(iconsDir, file);
  if (!existsSync(path)) {
    console.warn(`  no artwork for ${file} at ${path} - using the lucide glyph instead`);
    return null;
  }

  const bytes = await readFile(path);
  const info = describeImage(bytes);

  // The same rule an admin upload has to pass. Shipped artwork gets no waiver;
  // if one of these were oblong it would render stretched for everybody.
  assertSquare(info);

  return {
    logoData: toStorableBytes(bytes),
    logoType: info.type,
    logoVersion: randomUUID().slice(0, 8),
  };
}
