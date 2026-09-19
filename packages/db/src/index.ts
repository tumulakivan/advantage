import { SqliteBridge, createDrizzle, createWorker, type Database } from "./client";
import { migrate } from "./migrator";
import { seedIfEmpty } from "./seed";

export * from "./schema";
export * from "./client";
export * from "./migrator";
export { seedIfEmpty } from "./seed";
export * from "./queries/accounts";
export * from "./queries/categories";
export * from "./queries/transactions";
export * from "./queries/analytics";
export * from "./queries/outlook";
export * from "./queries/wallet";
export * from "./queries/budgets";
export * from "./queries/planned";
export * from "./queries/settings";
export * from "./queries/backup";
export type { StorageMode } from "./worker/protocol";

export interface Connection {
  db: Database;
  bridge: SqliteBridge;
  storage: "opfs" | "memory";
  seeded: boolean;
  appliedMigrations: string[];
}

/** Thrown when another tab already holds the database file. */
export class DatabaseLockedError extends Error {
  readonly code = "locked" as const;

  constructor() {
    super("adVantage is already open in another tab.");
    this.name = "DatabaseLockedError";
  }
}

/**
 * Open the database, bring the schema up to date, seed a first run. One call,
 * because there is never a reason for the app to do these out of order.
 */
export async function connect(): Promise<Connection> {
  const bridge = new SqliteBridge(createWorker());
  const storage = await bridge.open();

  if (storage === "locked") {
    bridge.terminate();
    throw new DatabaseLockedError();
  }

  const db = createDrizzle(bridge);

  const report = await migrate(bridge);
  const seeded = await seedIfEmpty(db);

  return { db, bridge, storage, seeded, appliedMigrations: report.applied };
}
