/// <reference lib="webworker" />

import sqlite3InitModule, {
  type Database as Sqlite3Db,
  type SAHPoolUtil,
  type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";

import { createEngine, type SqlEngine } from "./engine";
import type { StorageMode, WorkerRequest, WorkerResponse } from "./protocol";

/**
 * The only place SQLite actually runs.
 *
 * It has to be a dedicated worker: persistent storage uses the OPFS
 * SyncAccessHandle pool VFS, and `createSyncAccessHandle()` only exists off the
 * main thread. The pool VFS is a deliberate choice over the plain `opfs` one -
 * it needs no COOP/COEP headers, so this stays a plain static bundle that runs
 * from anywhere, with no server config.
 */

const DB_PATH = "/advantage.sqlite3";
const VFS_NAME = "advantage";

/**
 * A reload races the previous document: its worker is gone but the OS-level
 * sync access handles take a moment to be released. Retrying a few times turns
 * that race into a non-event; only a genuinely concurrent tab survives it.
 */
const POOL_ATTEMPTS = 5;
const POOL_BACKOFF_MS = 120;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isContention(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    message.includes("NoModificationAllowedError") ||
    message.includes("Access Handles cannot be created") ||
    message.includes("already in use")
  );
}

let db: Sqlite3Db | null = null;
let engine: SqlEngine | null = null;
let pool: SAHPoolUtil | null = null;
let sqlite3: Sqlite3Static | null = null;
let storage: StorageMode = "memory";

function attach(next: Sqlite3Db): void {
  db = next;
  db.exec("PRAGMA foreign_keys = ON;");
  engine = createEngine(db);
}

async function open(): Promise<{ storage: typeof storage }> {
  if (engine) return { storage };

  sqlite3 = await sqlite3InitModule();

  let lastError: unknown = null;

  for (let attempt = 0; attempt < POOL_ATTEMPTS; attempt += 1) {
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: VFS_NAME, initialCapacity: 6 });
      attach(new pool.OpfsSAHPoolDb(DB_PATH));
      return { storage: (storage = "opfs") };
    } catch (error) {
      lastError = error;
      pool = null;
      if (!isContention(error)) break;
      await delay(POOL_BACKOFF_MS * (attempt + 1));
    }
  }

  if (isContention(lastError)) {
    // Another tab owns the file. Opening an in-memory database here would look
    // like a working app and silently throw away everything typed into it.
    return { storage: (storage = "locked") };
  }

  console.warn("[sqlite] OPFS unavailable, falling back to in-memory", lastError);
  attach(new sqlite3.oo1.DB(":memory:", "ct"));
  return { storage: (storage = "memory") };
}

function requireEngine(): SqlEngine {
  if (!engine) throw new Error("Database is not open");
  return engine;
}

async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.kind) {
    case "open":
      return open();

    case "exec":
      return requireEngine().exec(request.sql, request.params, request.method);

    case "script":
      requireEngine().script(request.sql);
      return { ok: true };

    case "batch":
      return requireEngine().batch(request.statements);

    case "export": {
      if (!sqlite3 || !db) throw new Error("Database is not open");
      return { bytes: sqlite3.capi.sqlite3_js_db_export(db) };
    }

    case "import": {
      if (!pool) throw new Error("Importing a database file needs OPFS storage");
      requireEngine().close();
      engine = null;
      await pool.importDb(DB_PATH, request.bytes);
      attach(new pool.OpfsSAHPoolDb(DB_PATH));
      return { ok: true };
    }

    case "wipe": {
      requireEngine().close();
      engine = null;
      if (pool) {
        await pool.wipeFiles();
        attach(new pool.OpfsSAHPoolDb(DB_PATH));
      } else if (sqlite3) {
        attach(new sqlite3.oo1.DB(":memory:", "ct"));
      }
      return { ok: true };
    }

    default: {
      const exhaustive: never = request;
      throw new Error(`Unknown request: ${JSON.stringify(exhaustive)}`);
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await handle(request);
    const response: WorkerResponse = { id: request.id, ok: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
