/** Wire format between the main thread and the SQLite worker. */

export type ExecMethod = "all" | "get" | "values" | "run";

export interface ExecStatement {
  sql: string;
  params: unknown[];
  method: ExecMethod;
}

export type WorkerRequest =
  | { id: number; kind: "open" }
  | ({ id: number; kind: "exec" } & ExecStatement)
  | { id: number; kind: "script"; sql: string }
  | { id: number; kind: "batch"; statements: ExecStatement[] }
  | { id: number; kind: "export" }
  | { id: number; kind: "import"; bytes: Uint8Array }
  | { id: number; kind: "wipe" };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export interface ExecResult {
  rows: unknown[][] | unknown[];
  changes: number;
}

/**
 * `locked` means OPFS is available but another tab holds the file. The pool
 * VFS allows exactly one connection, so the honest answer is to say so rather
 * than quietly opening a second, in-memory database the user would lose.
 */
export type StorageMode = "opfs" | "memory" | "locked";

/**
 * What the migrator and the Drizzle driver need from a connection: anything
 * that can run a statement, a script and an atomic batch. `SqliteBridge`
 * implements it over a worker; tests implement it over a local engine.
 */
export interface AsyncSqlRunner {
  exec(sql: string, params: unknown[], method: ExecMethod): Promise<ExecResult>;
  script(sql: string): Promise<void>;
  batch(statements: ExecStatement[]): Promise<ExecResult[]>;
}
