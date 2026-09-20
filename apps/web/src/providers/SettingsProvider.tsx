import { readSettings, writeSettings } from "@advantage/api-client";
import {
  DEFAULT_SETTINGS,
  formatMoney,
  type AppSettings,
  type MoneyFormatOptions,
} from "@advantage/core";
import * as React from "react";

import { invalidateQueries, useLiveQuery } from "@/hooks/useLiveQuery";
import { applyTheme } from "@/lib/theme";
import { useSession } from "@/providers/SessionProvider";

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  /** Currency- and locale-aware money formatter. */
  money: (minor: number, options?: MoneyFormatOptions) => string;
  toggleTheme: () => void;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { api, status } = useSession();
  const { data: settings, loading } = useLiveQuery(
    (client) => readSettings(client),
    [],
    DEFAULT_SETTINGS,
  );

  // The stored theme wins on first paint (index.html reads it); once the
  // account's settings arrive their value becomes the source of truth.
  React.useEffect(() => {
    if (status === "signed-in") applyTheme(settings.theme);
  }, [settings.theme, status]);

  const update = React.useCallback(
    async (patch: Partial<AppSettings>) => {
      // Theme is applied before the request rather than after it: a toggle
      // that waits on a round trip feels broken, and it is a preference, not
      // a figure - nothing depends on it being confirmed.
      if (patch.theme) applyTheme(patch.theme);
      await writeSettings(api, patch);
      invalidateQueries();
    },
    [api],
  );

  const value = React.useMemo<SettingsContextValue>(
    () => ({
      settings,
      loading,
      update,
      money: (minor, options) =>
        formatMoney(minor, {
          currency: settings.currency,
          locale: settings.locale,
          ...options,
        }),
      toggleTheme: () => void update({ theme: settings.theme === "dark" ? "light" : "dark" }),
    }),
    [settings, loading, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = React.useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside <SettingsProvider>");
  return context;
}

/** Just the formatter, which is what most components actually want. */
export function useMoney() {
  return useSettings().money;
}
