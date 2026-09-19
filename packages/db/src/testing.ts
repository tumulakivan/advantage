import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import { createDrizzle, type Database } from "./client";
import { migrate } from "./migrator";
import { seedIfEmpty } from "./seed";
import { createEngine, type SqlEngine } from "./worker/engine";
import type { AsyncSqlRunner } from "./worker/protocol";

/**
 * An in-memory connection for tests, built from the same engine and migrations
 * the browser uses. Nothing here is mocked: the SQL under test is the SQL that
 * ships.
 */
export interface TestConnection {
  db: Database;
  runner: AsyncSqlRunner;
  engine: SqlEngine;
  close(): void;
}

export async function createTestConnection(
  options: { seed?: boolean } = {},
): Promise<TestConnection> {
  const sqlite3 = await sqlite3InitModule();
  const engine = createEngine(new sqlite3.oo1.DB(":memory:", "ct"));

  const runner: AsyncSqlRunner = {
    exec: async (sql, params, method) => engine.exec(sql, params, method),
    script: async (sql) => engine.script(sql),
    batch: async (statements) => engine.batch(statements),
  };

  const db = createDrizzle(runner);
  await migrate(runner);
  if (options.seed !== false) await seedIfEmpty(db);

  return { db, runner, engine, close: () => engine.close() };
}
