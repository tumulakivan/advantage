import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { disconnect, prisma } from "../src/db/client";
import { tenantFor } from "../src/db/tenant";
import { exportBackup, importBackup } from "../src/queries/backup";
import { databaseStats } from "../src/queries/settings";

/**
 * Load a backup file into an existing account, from the command line.
 *
 *   npm run import:backup -w @advantage/api -- \
 *     --email you@example.com --file ../../initial_data/advantage-backup.json
 *
 * This is how the records from the local-first build become user number one's
 * ledger. Sign up through the app first so the account exists, then point this
 * at the file the old Settings screen downloaded.
 *
 * It takes a safety copy of whatever the account already holds before it
 * replaces it, because a restore is destructive by definition and the whole
 * point of this app is not losing someone's financial history.
 */
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    file: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

if (!values.email || !values.file) {
  console.error("Usage: import-backup --email <address> --file <backup.json> [--force]");
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email: values.email },
  select: { id: true, email: true },
});

if (!user) {
  console.error(
    `No account for ${values.email}. Sign up in the app first, then run this again.`,
  );
  await disconnect();
  process.exit(1);
}

const path = resolve(process.cwd(), values.file);
const payload: unknown = JSON.parse(await readFile(path, "utf8"));
const tenant = tenantFor(user.id);

const before = await databaseStats(tenant);
const hasData = (before.transactions ?? 0) > 0 || (before.budgets ?? 0) > 0;

if (hasData && !values.force) {
  console.error(
    `${user.email} already has ${before.transactions} records. ` +
      `Restoring replaces all of it - pass --force if that is what you want.`,
  );
  await disconnect();
  process.exit(1);
}

if (hasData) {
  const safety = await exportBackup(tenant);
  const name = `safety-backup-${user.id}-${Date.now()}.json`;
  await (await import("node:fs/promises")).writeFile(name, JSON.stringify(safety, null, 2));
  console.log(`Wrote a safety copy of the current ledger to ${name}`);
}

await importBackup(tenant, payload);

const after = await databaseStats(tenant);
console.log(`\nImported into ${user.email}:\n`);
for (const [label, count] of Object.entries(after)) {
  console.log(`  ${label.padEnd(16)} ${count}`);
}

await disconnect();
