import { connect, DatabaseLockedError, type Connection, type Database } from "@advantage/db";
import * as React from "react";

type Status = "connecting" | "ready" | "error" | "locked";

interface DbContextValue {
  status: Status;
  error: string | null;
  connection: Connection | null;
  db: Database | null;
  retry: () => void;
}

const DbContext = React.createContext<DbContextValue | null>(null);

/**
 * Opens the SQLite worker exactly once for the app. StrictMode double-invokes
 * effects in development, so the promise is kept in a ref and reused rather
 * than spawning a second worker that would fight over the same OPFS file.
 */
export function DbProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [connection, setConnection] = React.useState<Connection | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const pending = React.useRef<Promise<Connection> | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    if (!pending.current) pending.current = connect();

    pending.current
      .then((next) => {
        if (cancelled) return;
        setConnection(next);
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        pending.current = null;
        setError(reason instanceof Error ? reason.message : String(reason));
        setStatus(reason instanceof DatabaseLockedError ? "locked" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /**
   * The OPFS pool holds one sync access handle per file for as long as the
   * worker lives. Killing it on the way out releases them immediately, so the
   * next load - or another tab - does not have to wait out a retry loop.
   */
  React.useEffect(() => {
    if (!connection) return;
    const release = () => connection.bridge.terminate();
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, [connection]);

  const value = React.useMemo<DbContextValue>(
    () => ({
      status,
      error,
      connection,
      db: connection?.db ?? null,
      retry: () => {
        pending.current = null;
        setError(null);
        setStatus("connecting");
        setAttempt((current) => current + 1);
      },
    }),
    [status, error, connection],
  );

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useConnection(): DbContextValue {
  const context = React.useContext(DbContext);
  if (!context) throw new Error("useConnection must be used inside <DbProvider>");
  return context;
}

/** The database, once it is open. Throws if called before the app is ready. */
export function useDb(): Database {
  const { db } = useConnection();
  if (!db) throw new Error("Database is not ready yet");
  return db;
}
