import { DEFAULT_SETTINGS, formatMoney, type AppSettings, type MoneyFormatOptions } from "@advantage/core";
import { readSettings, writeSettings } from "@advantage/db";
import * as React from "react";

import { invalidateQueries, useLiveQuery } from "@/hooks/useLiveQuery";
import { useConnection } from "@/providers/DbProvider";

const THEME_KEY = "advantage.theme";

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  /** Currency- and locale-aware money formatter. */
  money: (minor: number, options?: MoneyFormatOptions) => string;
  toggleTheme: () => void;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

function applyTheme(theme: "dark" | "light"): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the class is still applied, the choice just will not stick.
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { db, status } = useConnection();
  const { data: settings, loading } = useLiveQuery(
    (database) => readSettings(database),
    [],
    DEFAULT_SETTINGS,
  );

  // The stored theme wins on first paint (index.html reads it); once the
  // database is open its value becomes the source of truth.
  React.useEffect(() => {
    if (status === "ready") applyTheme(settings.theme);
  }, [settings.theme, status]);

  const update = React.useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!db) return;
      if (patch.theme) applyTheme(patch.theme);
      await writeSettings(db, patch);
      invalidateQueries();
    },
    [db],
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
