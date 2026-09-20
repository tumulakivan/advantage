import { getMe, type ApiClient } from "@advantage/api-client";
import * as React from "react";

import { api, authClient, setUnauthorizedHandler } from "@/lib/api";

type Status = "loading" | "signed-in" | "signed-out";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Decided by the service from its configured list, not by a column. */
  isAdmin: boolean;
}

interface SessionContextValue {
  status: Status;
  user: SessionUser | null;
  /** False until the admin question has been answered either way. */
  adminResolved: boolean;
  api: ApiClient;
  signOut: () => Promise<void>;
  /** Re-read the session - after a sign-in, or after deleting the account. */
  refresh: () => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

/**
 * Who is using the app, and the client they talk to it with.
 *
 * This is what `DbProvider` used to be. That one opened a SQLite worker and
 * waited for OPFS; this one waits for a session cookie to be validated. The
 * app still renders nothing until it resolves, for the same reason: every
 * screen inside reads from it, and a half-loaded dashboard is a flash of
 * zeroes.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending, refetch } = authClient.useSession();

  // Any request coming back 401 ends the session everywhere at once, rather
  // than each screen discovering it separately.
  React.useEffect(() => {
    setUnauthorizedHandler(() => void refetch());
    return () => setUnauthorizedHandler(null);
  }, [refetch]);

  /**
   * Whether this person administers the service.
   *
   * It comes from the API rather than the session cookie, because the answer
   * lives in the service's configuration and nowhere in the user's row - which
   * is what makes it something a user cannot grant themselves. The flag only
   * decides whether a nav link is drawn; every admin route checks again.
   */
  const [isAdmin, setIsAdmin] = React.useState(false);
  /**
   * Whether the answer has arrived yet. Without this, "not an admin" and "we
   * have not asked" are the same value, and anything that guards on the flag
   * turns a real admin away for the one render before the reply lands - which
   * is exactly how long it takes to redirect them off their own page.
   */
  const [adminResolved, setAdminResolved] = React.useState(false);
  const userId = data?.user?.id ?? null;

  React.useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      setAdminResolved(!isPending);
      return;
    }

    let cancelled = false;
    setAdminResolved(false);

    getMe(api)
      .then((me) => {
        if (cancelled) return;
        setIsAdmin(me.isAdmin);
        setAdminResolved(true);
      })
      .catch(() => {
        // Not being able to tell means not showing the link, which is the
        // safe way to be wrong.
        if (cancelled) return;
        setIsAdmin(false);
        setAdminResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, isPending]);

  const value = React.useMemo<SessionContextValue>(() => {
    const user = data?.user
      ? { id: data.user.id, email: data.user.email, name: data.user.name, isAdmin }
      : null;

    return {
      status: isPending ? "loading" : user ? "signed-in" : "signed-out",
      user,
      adminResolved,
      api,
      signOut: async () => {
        await authClient.signOut();
        void refetch();
      },
      refresh: () => void refetch(),
    };
  }, [data, isPending, refetch, isAdmin, adminResolved]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = React.useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}

/** The API client. Named for symmetry with the `useDb()` it replaced. */
export function useApi(): ApiClient {
  return useSession().api;
}
