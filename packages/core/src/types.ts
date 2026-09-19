/** Domain vocabulary. The DB schema mirrors these unions as text columns. */

export const TRANSACTION_TYPES = ["expense", "income", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ACCOUNT_TYPES = ["cash", "bank", "ewallet", "credit", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly", "once"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const BUDGET_PERIODS = ["monthly"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** A single amount, always in minor units (centavos) as a safe integer. */
export type Minor = number;

export interface MoneyFormatOptions {
  currency?: string;
  locale?: string;
  /** Always show + / - even for income. */
  signed?: boolean;
  /** 12.4K instead of 12,400.00 - for axis ticks only, never for a record. */
  compact?: boolean;
  /** Drop the .00 tail. */
  hideCents?: boolean;
}

export interface AppSettings {
  currency: string;
  locale: string;
  /** 1-28: the day a budgeting month starts. 1 = calendar month. */
  monthStartDay: number;
  theme: "dark" | "light";
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: "PHP",
  locale: "en-PH",
  monthStartDay: 1,
  theme: "dark",
};
