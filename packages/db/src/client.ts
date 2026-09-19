import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import * as schema from "./schema";
import type {
  AsyncSqlRunner,
  ExecMethod,
  ExecResult,
  ExecStatement,
  StorageMode,
  WorkerRequest,
  WorkerResponse,
} from "./worker/protocol";

export type Database = SqliteRemoteDatabase<typeof schema>;

/** Omit that distributes over a union, so the request discriminant survives. */
type RequestBody<T> = T extends unknown ? Omit<T, "id"> : never;

/**
 * Main-thread half of the SQLite connection: a request/response channel to the
 * worker, wrapped in Drizzle's async proxy driver. Drizzle builds the SQL and
 * this posts it across; nothing here knows anything about the schema.
 */
export class SqliteBridge {
  private readonly worker: Worker;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private sequence = 0;
  private storageMode: StorageMode = "memory";

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) return;
      this.pending.delete(response.id);
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new Error(response.error));
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "SQLite worker crashed");
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  get storage(): StorageMode {
    return this.storageMode;
  }

  /** True when data survives a reload. False means an in-memory fallback. */
  get durable(): boolean {
    return this.storageMode === "opfs";
  }

  private send<T>(request: RequestBody<WorkerRequest>): Promise<T> {
    const id = (this.sequence += 1);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage({ ...request, id } as WorkerRequest);
    });
  }

  async open(): Promise<StorageMode> {
    const result = await this.send<{ storage: StorageMode }>({ kind: "open" });
    this.storageMode = result.storage;
    return result.storage;
  }

  exec(sql: string, params: unknown[], method: ExecMethod): Promise<ExecResult> {
    return this.send<ExecResult>({ kind: "exec", sql, params, method });
  }

  /** Multi-statement SQL, used by the migrator. */
  script(sql: string): Promise<void> {
    return this.send<void>({ kind: "script", sql });
  }

  batch(statements: ExecStatement[]): Promise<ExecResult[]> {
    return this.send<ExecResult[]>({ kind: "batch", statements });
  }

  async exportBytes(): Promise<Uint8Array> {
    const result = await this.send<{ bytes: Uint8Array }>({ kind: "export" });
    return result.bytes;
  }

  importBytes(bytes: Uint8Array): Promise<void> {
    return this.send<void>({ kind: "import", bytes });
  }

  wipe(): Promise<void> {
    return this.send<void>({ kind: "wipe" });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

export function createWorker(): Worker {
  return new Worker(new URL("./worker/sqlite.worker.ts", import.meta.url), {
    type: "module",
    name: "advantage-sqlite",
  });
}

export function createDrizzle(runner: AsyncSqlRunner): Database {
  return drizzle(
    async (sql, params, method) => {
      const result = await runner.exec(sql, params, method);
      return { rows: result.rows as unknown[] };
    },
    async (queries) => {
      const results = await runner.batch(
        queries.map((query) => ({
          sql: query.sql,
          params: query.params,
          method: query.method,
        })),
      );
      return results.map((result) => ({ rows: result.rows as unknown[] }));
    },
    { schema },
  );
}
