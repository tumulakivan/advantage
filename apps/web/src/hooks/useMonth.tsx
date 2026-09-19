import { addMonths, currentMonthKey, monthLabel, type MonthKey } from "@advantage/core";
import * as React from "react";

import { useSettings } from "@/providers/SettingsProvider";

/**
 * The selected month, shared by every screen through the URL-free simple route:
 * a month is a view state, not a location, so it lives in a provider.
 */
interface MonthContextValue {
  month: MonthKey;
  label: string;
  isCurrent: boolean;
  setMonth: (month: MonthKey) => void;
  step: (delta: number) => void;
  toCurrent: () => void;
}

const MonthContext = React.createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [month, setMonth] = React.useState<MonthKey>(() => currentMonthKey());

  const value = React.useMemo<MonthContextValue>(() => {
    const current = currentMonthKey();
    return {
      month,
      label: monthLabel(month, settings.locale, "long"),
      isCurrent: month === current,
      setMonth,
      step: (delta: number) => setMonth((value) => addMonths(value, delta)),
      toCurrent: () => setMonth(current),
    };
  }, [month, settings.locale]);

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth(): MonthContextValue {
  const context = React.useContext(MonthContext);
  if (!context) throw new Error("useMonth must be used inside <MonthProvider>");
  return context;
}
