import type { ApiClient } from "@advantage/api-client";
import * as React from "react";

import { useSession } from "@/providers/SessionProvider";

/**
 * A minimal live-query layer on top of React itself - still no data-fetching
 * library.
 *
 * Reads subscribe to a single revision counter; any write bumps it and every
 * mounted query re-runs. Against a local SQLite file that was free: a read
 * cost about 0.2 ms and refetching everything removed the entire class of
 * "stale cache after an edit" bug.
 *
 * Over a network the same pattern is a thundering herd, so two things changed.
 * The heavy screens each collapsed into one endpoint, so a refetch is a
 * handful of requests rather than twenty. And a query that is superseded -
 * because the month changed, or a write landed mid-flight - aborts rather than
 * racing the new one to `setState`.
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
  /**
   * True while a request is in flight *for a different question than the one
   * `data` answers* - a new month, a new outlook window.
   *
   * The distinction did not exist locally, where a read returned before the
   * next paint. Over a network it decides whether keeping the old figures on
   * screen is a courtesy or a lie: re-running the same query after a write,
   * showing the previous numbers for a moment is fine; changing the month and
   * showing last month's numbers under this month's heading is not.
   */
  stale: boolean;
  error: string | null;
  /** Re-run just this query. */
  refresh: () => void;
}

export function useLiveQuery<T>(
  run: (api: ApiClient, signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
  initial: T,
): QueryResult<T> {
  const { api, status } = useSession();
  const globalRevision = useRevision();
  const [localRevision, setLocalRevision] = React.useState(0);
  const [data, setData] = React.useState<T>(initial);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // The query closure changes identity every render; deps decide when it runs.
  const latest = React.useRef(run);
  latest.current = run;

  // Which question the data currently on screen is an answer to.
  const depsKey = JSON.stringify(deps);
  const answered = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (status !== "signed-in") return;

    const controller = new AbortController();
    setLoading(true);

    latest
      .current(api, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        answered.current = depsKey;
        setData(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        // A 401 is not this query's problem - the session provider is already
        // swapping the app for the sign-in page.
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, status, globalRevision, localRevision, ...deps]);

  const refresh = React.useCallback(() => setLocalRevision((current) => current + 1), []);

  return {
    data,
    loading,
    stale: loading && answered.current !== depsKey,
    error,
    refresh,
  };
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
