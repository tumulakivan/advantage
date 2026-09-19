import type { Database as Sqlite3Db, SqlValue } from "@sqlite.org/sqlite-wasm";

import type { ExecMethod, ExecResult, ExecStatement } from "./protocol";

/**
 * Statement execution against an open SQLite handle. Kept separate from the
 * worker shell so the exact same code path can be driven from Node in tests -
 * the SQL that runs in the browser is the SQL the tests assert on.
 */
export interface SqlEngine {
  exec(sql: string, params: readonly unknown[], method: ExecMethod): ExecResult;
  script(sql: string): void;
  batch(statements: readonly ExecStatement[]): ExecResult[];
  close(): void;
}

/** Drizzle hands us `undefined` for unset columns; SQLite only binds null. */
function normalizeParams(params: readonly unknown[]): SqlValue[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
      return value;
    }
    if (value instanceof Uint8Array) return value;
    return String(value);
  });
}

export function createEngine(db: Sqlite3Db): SqlEngine {
  function exec(sql: string, params: readonly unknown[], method: ExecMethod): ExecResult {
    const bind = normalizeParams(params);

    if (method === "run") {
      db.exec({ sql, bind });
      return { rows: [], changes: Number(db.changes()) };
    }

    const rows = db.exec({ sql, bind, rowMode: "array", returnValue: "resultRows" });

    // Drizzle expects a single flat row for `get`, and rows-of-values otherwise.
    if (method === "get") return { rows: rows[0] ?? [], changes: 0 };
    return { rows, changes: 0 };
  }

  return {
    exec,

    script(sql: string) {
      db.exec(sql);
    },

    /** All-or-nothing: the migrator and multi-write mutations depend on this. */
    batch(statements: readonly ExecStatement[]) {
      db.exec("BEGIN");
      try {
        const results = statements.map((statement) =>
          exec(statement.sql, statement.params, statement.method),
        );
        db.exec("COMMIT");
        return results;
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // A failed rollback just means the transaction was already closed.
        }
        throw error;
      }
    },

    close() {
      db.close();
    },
  };
}
