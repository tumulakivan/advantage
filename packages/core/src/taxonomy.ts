import type { AccountType, CategoryKind } from "./types";

/**
 * The starting taxonomy.
 *
 * Deliberately **seven** top-level expense groups, each owning one categorical
 * chart slot. Every breakdown chart in the app groups by top level, so it never
 * needs an eighth hue and never repeats one - detail lives in subcategories,
 * which are read in lists and drill-downs where labels carry identity.
 */

export interface SeedCategory {
  slug: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  /** Chart slot token, or null for children (they inherit the parent hue). */
  color: string | null;
  parent?: string;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  // ---- expense groups ------------------------------------------------------
  { slug: "bills", name: "Bills & Utilities", kind: "expense", icon: "Plug", color: "chart-1" },
  { slug: "bills-electricity", name: "Electricity", kind: "expense", icon: "Zap", color: null, parent: "bills" },
  { slug: "bills-internet", name: "Internet", kind: "expense", icon: "Wifi", color: null, parent: "bills" },
  { slug: "bills-water", name: "Water", kind: "expense", icon: "Droplets", color: null, parent: "bills" },
  { slug: "bills-mobile", name: "Mobile & Load", kind: "expense", icon: "Smartphone", color: null, parent: "bills" },
  { slug: "bills-subscriptions", name: "Subscriptions", kind: "expense", icon: "Repeat", color: null, parent: "bills" },

  { slug: "loans", name: "Loans & Installments", kind: "expense", icon: "Landmark", color: "chart-2" },
  { slug: "loans-bnpl", name: "Buy Now Pay Later", kind: "expense", icon: "CreditCard", color: null, parent: "loans" },
  { slug: "loans-cash", name: "Cash Loan", kind: "expense", icon: "HandCoins", color: null, parent: "loans" },
  { slug: "loans-card", name: "Credit Card", kind: "expense", icon: "CreditCard", color: null, parent: "loans" },
  { slug: "loans-interest", name: "Interest & Penalties", kind: "expense", icon: "Percent", color: null, parent: "loans" },

  { slug: "food", name: "Food & Dining", kind: "expense", icon: "UtensilsCrossed", color: "chart-3" },
  { slug: "food-groceries", name: "Groceries", kind: "expense", icon: "ShoppingBasket", color: null, parent: "food" },
  { slug: "food-restaurants", name: "Restaurants", kind: "expense", icon: "UtensilsCrossed", color: null, parent: "food" },
  { slug: "food-coffee", name: "Coffee & Snacks", kind: "expense", icon: "Coffee", color: null, parent: "food" },
  { slug: "food-delivery", name: "Food Delivery", kind: "expense", icon: "Bike", color: null, parent: "food" },

  { slug: "transport", name: "Transport", kind: "expense", icon: "Car", color: "chart-4" },
  { slug: "transport-fuel", name: "Fuel", kind: "expense", icon: "Fuel", color: null, parent: "transport" },
  { slug: "transport-ride", name: "Ride Hailing", kind: "expense", icon: "CarTaxiFront", color: null, parent: "transport" },
  { slug: "transport-fare", name: "Fare & Commute", kind: "expense", icon: "Bus", color: null, parent: "transport" },
  { slug: "transport-upkeep", name: "Parking & Upkeep", kind: "expense", icon: "Wrench", color: null, parent: "transport" },

  { slug: "home", name: "Home & Family", kind: "expense", icon: "House", color: "chart-5" },
  { slug: "home-rent", name: "Rent", kind: "expense", icon: "KeyRound", color: null, parent: "home" },
  { slug: "home-support", name: "Family Support", kind: "expense", icon: "HeartHandshake", color: null, parent: "home" },
  { slug: "home-supplies", name: "Household Supplies", kind: "expense", icon: "SprayCan", color: null, parent: "home" },
  { slug: "home-repairs", name: "Repairs & Furniture", kind: "expense", icon: "Hammer", color: null, parent: "home" },

  { slug: "life", name: "Personal & Lifestyle", kind: "expense", icon: "Sparkles", color: "chart-6" },
  { slug: "life-shopping", name: "Shopping", kind: "expense", icon: "ShoppingBag", color: null, parent: "life" },
  { slug: "life-health", name: "Health & Pharmacy", kind: "expense", icon: "Stethoscope", color: null, parent: "life" },
  { slug: "life-fitness", name: "Fitness", kind: "expense", icon: "Dumbbell", color: null, parent: "life" },
  { slug: "life-fun", name: "Entertainment", kind: "expense", icon: "Gamepad2", color: null, parent: "life" },
  { slug: "life-travel", name: "Travel", kind: "expense", icon: "Plane", color: null, parent: "life" },
  { slug: "life-gifts", name: "Gifts & Donations", kind: "expense", icon: "Gift", color: null, parent: "life" },

  { slug: "work", name: "Business & Fees", kind: "expense", icon: "Briefcase", color: "chart-7" },
  { slug: "work-fees", name: "Bank & Transfer Fees", kind: "expense", icon: "Receipt", color: null, parent: "work" },
  { slug: "work-tax", name: "Taxes", kind: "expense", icon: "FileText", color: null, parent: "work" },
  { slug: "work-tools", name: "Tools & Software", kind: "expense", icon: "Laptop", color: null, parent: "work" },

  // ---- income --------------------------------------------------------------
  { slug: "income-salary", name: "Salary", kind: "income", icon: "Wallet", color: "chart-1" },
  { slug: "income-rental", name: "Rental Income", kind: "income", icon: "Building2", color: "chart-3" },
  { slug: "income-bonus", name: "Bonus & Incentive", kind: "income", icon: "TrendingUp", color: "chart-4" },
  { slug: "income-refund", name: "Refund & Reimbursement", kind: "income", icon: "Undo2", color: "chart-5" },
  { slug: "income-other", name: "Other Income", kind: "income", icon: "CirclePlus", color: "chart-7" },
];

export interface SeedIncomeSource {
  slug: string;
  name: string;
  shortName: string;
  color: string;
  defaultCategory: string;
}

/**
 * What a new account starts with: one generic source, so the income form always
 * has something to pick and a first-run user is never stuck.
 *
 * It is an example to rename, not a fixture. Income sources are rows rather
 * than an enum precisely so that everyone can describe their own arrangement -
 * one employer, three clients, a rental and a side business - without a
 * migration. They are text only: whose payroll it is is the user's business,
 * and a logo for it would be ours to host and moderate.
 */
export const SEED_INCOME_SOURCES: SeedIncomeSource[] = [
  {
    slug: "salary",
    name: "Salary",
    shortName: "Salary",
    color: "chart-1",
    defaultCategory: "income-salary",
  },
];

export interface SeedAccount {
  slug: string;
  name: string;
  type: AccountType;
  icon: string;
  openingBalanceMinor: number;
}

/**
 * The wallet a new account starts with: cash, and nothing else.
 *
 * Everyone has cash. Nobody has every bank, and seeding five of them means a
 * new user's first task is deleting four accounts that were never theirs.
 * The rest are added from the catalog - see `SEED_ACCOUNT_CATALOG`.
 */
export const SEED_ACCOUNTS: SeedAccount[] = [
  { slug: "cash", name: "Cash", type: "cash", icon: "Banknote", openingBalanceMinor: 0 },
];

export interface CatalogEntrySeed {
  slug: string;
  name: string;
  type: AccountType;
  /** Lucide glyph, used whenever the entry has no logo image. */
  icon: string;
  /** File in `icons/`, uploaded into the catalog by the seed script. */
  logoFile?: string;
}

/**
 * The shared catalog of known accounts, which everyone picks from and only an
 * admin edits.
 *
 * This is the one piece of the app that is not per-user. A logo is a brand
 * asset: hosting one copy that an admin curates is the difference between
 * "GCash looks right for everybody" and every user uploading their own
 * screenshot of it. An account slug is still how a wallet finds its mark, so
 * renaming an account keeps it.
 */
export const SEED_ACCOUNT_CATALOG: CatalogEntrySeed[] = [
  { slug: "cash", name: "Cash", type: "cash", icon: "Banknote" },
  { slug: "maribank", name: "Maribank", type: "bank", icon: "Landmark", logoFile: "maribank.png" },
  { slug: "unionbank", name: "UnionBank", type: "bank", icon: "Landmark", logoFile: "unionbank.png" },
  { slug: "gcash", name: "GCash", type: "ewallet", icon: "Smartphone", logoFile: "gcash.png" },
  { slug: "wise", name: "Wise", type: "ewallet", icon: "Landmark", logoFile: "wise.png" },
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-wallet",
  credit: "Credit",
  savings: "Savings",
};

/** Icon names referenced by seeds and offered in the category editor. */
export const ICON_CHOICES = [
  "Plug", "Zap", "Wifi", "Droplets", "Smartphone", "Repeat",
  "Landmark", "CreditCard", "HandCoins", "Percent", "Banknote", "PiggyBank",
  "UtensilsCrossed", "ShoppingBasket", "Coffee", "Bike",
  "Car", "Fuel", "CarTaxiFront", "Bus", "Wrench",
  "House", "KeyRound", "HeartHandshake", "SprayCan", "Hammer",
  "Sparkles", "ShoppingBag", "Stethoscope", "Dumbbell", "Gamepad2", "Plane", "Gift",
  "Briefcase", "Receipt", "FileText", "Laptop",
  "Wallet", "Building2", "TrendingUp", "Undo2", "CirclePlus", "Tag",
] as const;

export type IconName = (typeof ICON_CHOICES)[number];
