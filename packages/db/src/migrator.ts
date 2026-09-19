/// <reference types="vite/client" />

import type { AsyncSqlRunner } from "./worker/protocol";

/**
 * Runtime migrator.
 *
 * Drizzle Kit's own migrator is Node-only (it reads the journal off disk), so
 * the generated `.sql` files are inlined into the bundle instead and applied
 * here. Each file runs once, inside a transaction, and is recorded by filename
 * - the same contract as the Node migrator, minus the filesystem.
 */

const MIGRATIONS_TABLE = "__advantage_migrations";

/** Schema, owned by Drizzle Kit - never hand-edited. */
const schemaFiles = import.meta.glob<string>("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Data, hand-written. Kept in its own folder so Drizzle Kit's numbering can
 * never collide with a file it did not generate, and so a schema diff stays
 * readable without backfills mixed into it. Applied after the schema, since a
 * backfill can only run against tables that exist.
 */
const dataFiles = import.meta.glob<string>("../data-migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export interface Migration {
  name: string;
  statements: string[];
}

function collect(files: Record<string, string>, prefix: string): Migration[] {
  return Object.entries(files)
    .map(([path, sql]) => ({
      name: `${prefix}${path.split("/").pop() ?? path}`,
      statements: splitStatements(sql),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const migrations: Migration[] = [
  ...collect(schemaFiles, ""),
  ...collect(dataFiles, "data/"),
];

/** Drizzle Kit separates statements with a breakpoint comment. */
function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !isCommentOnly(statement));
}

/**
 * True only when a chunk is nothing but comments. Testing `startsWith("--")`
 * would instead throw away every statement that has an explanation written
 * above it, which is most of a hand-written data migration.
 */
function isCommentOnly(statement: string): boolean {
  return statement
    .split("\n")
    .every((line) => line.trim() === "" || line.trim().startsWith("--"));
}

export interface MigrationReport {
  applied: string[];
  alreadyApplied: number;
}

export async function migrate(runner: AsyncSqlRunner): Promise<MigrationReport> {
  await runner.script(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`,
  );

  const existing = await runner.exec(`SELECT name FROM ${MIGRATIONS_TABLE}`, [], "all");
  const done = new Set(
    (existing.rows as unknown[][]).map((row) => String(row[0])),
  );

  const applied: string[] = [];

  for (const migration of migrations) {
    if (done.has(migration.name)) continue;

    await runner.batch([
      ...migration.statements.map((sql) => ({ sql, params: [], method: "run" as const })),
      {
        sql: `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`,
        params: [migration.name, new Date().toISOString()],
        method: "run" as const,
      },
    ]);

    applied.push(migration.name);
  }

  return { applied, alreadyApplied: done.size };
}
