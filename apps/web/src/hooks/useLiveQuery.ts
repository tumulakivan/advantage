import type { Database } from "@advantage/db";
import * as React from "react";

import { useConnection } from "@/providers/DbProvider";

/**
 * A minimal live-query layer on top of React itself - no data-fetching library.
 *
 * Reads subscribe to a single revision counter; any write bumps it and every
 * mounted query re-runs. For a local SQLite file where the whole dataset is a
 * few thousand rows, refetching everything is both correct and instant, and it
 * removes the entire class of "stale cache after an edit" bugs.
 */
let revision = 0;
const listeners = new Set<() => void>();

export function invalidateQueries(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getRevision(): number {
  return revision;
}

export function useRevision(): number {
  return React.useSyncExternalStore(subscribe, getRevision, getRevision);
}

export interface QueryResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  /** Re-run just this query. */
  refresh: () => void;
}

export function useLiveQuery<T>(
  run: (db: Database) => Promise<T>,
  deps: React.DependencyList,
  initial: T,
): QueryResult<T> {
  const { db, status } = useConnection();
  const globalRevision = useRevision();
  const [localRevision, setLocalRevision] = React.useState(0);
  const [data, setData] = React.useState<T>(initial);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // The query closure changes identity every render; deps decide when it runs.
  const latest = React.useRef(run);
  latest.current = run;

  React.useEffect(() => {
    if (!db || status !== "ready") return;
    let cancelled = false;
    setLoading(true);

    latest
      .current(db)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, status, globalRevision, localRevision, ...deps]);

  const refresh = React.useCallback(() => setLocalRevision((current) => current + 1), []);

  return { data, loading, error, refresh };
}

export interface MutationState {
  run: <T>(action: () => Promise<T>) => Promise<T | null>;
  pending: boolean;
  error: string | null;
}

/**
 * Wraps a write: tracks pending state, surfaces the error message, and
 * invalidates every read on success.
 */
export function useMutation(): MutationState {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      invalidateQueries();
      return result;
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error };
}
