import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  FREQUENCIES,
  TRANSACTION_TYPES,
} from "@advantage/core";
import { z } from "zod";

/**
 * What the service will accept. The browser is not the only thing that can
 * reach these routes, so every write is parsed rather than trusted.
 *
 * The date shapes are checked as strings on purpose: `YYYY-MM-DD` and `YYYY-MM`
 * are the storage format, and turning them into Date objects here just to
 * format them back would be the one place a timezone could creep in.
 */

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");
export const monthKey = z.string().regex(/^\d{4}-\d{2}$/, "Expected a YYYY-MM month");

/**
 * Money is a 32-bit integer count of centavos in Postgres, so the ceiling on a
 * single record is about 21.4 million pesos. Saying so here turns a driver
 * error into a sentence someone can act on.
 */
export const minorAmount = z
  .number()
  .int("Amounts are whole centavos")
  .gte(-2_147_483_647)
  .lte(2_147_483_647, "That amount is too large to store");

const id = z.string().min(1).max(64);
const nullableId = id.nullable().default(null);
const nullableText = z.string().max(2000).nullable().default(null);

// ---- accounts ---------------------------------------------------------------

export const accountInput = z.object({
  slug: z.string().max(64).nullable().default(null),
  name: z.string().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES).default("cash"),
  icon: z.string().max(64).default("Wallet"),
  color: z.string().max(64).nullable().default(null),
  openingBalanceMinor: minorAmount.default(0),
  currency: z.string().length(3).default("PHP"),
  excludeFromTotals: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const accountPatch = accountInput.partial();

// ---- categories -------------------------------------------------------------

export const categoryInput = z.object({
  slug: z.string().max(64).nullable().default(null),
  name: z.string().min(1).max(120),
  kind: z.enum(CATEGORY_KINDS).default("expense"),
  icon: z.string().max(64).default("Tag"),
  color: z.string().max(64).nullable().default(null),
  parentId: nullableId,
  isSystem: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const categoryPatch = categoryInput.partial();

// ---- transactions -----------------------------------------------------------

export const transactionInput = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amountMinor: minorAmount,
  date: isoDate,
  accountId: id,
  toAccountId: nullableId,
  categoryId: nullableId,
  incomeSourceId: nullableId,
  payee: nullableText,
  note: nullableText,
  plannedPaymentId: nullableId,
});

export const transactionPatch = transactionInput.partial();

/** Filters arrive as query parameters, so everything starts life as a string. */
export const transactionFilters = z.object({
  types: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter((part): part is (typeof TRANSACTION_TYPES)[number] =>
              (TRANSACTION_TYPES as readonly string[]).includes(part),
            )
        : undefined,
    ),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  incomeSourceId: z.string().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ---- budgets ----------------------------------------------------------------

export const budgetInput = z.object({
  categoryId: id.nullable(),
  amountMinor: minorAmount,
  startMonth: monthKey,
  rollover: z.boolean().optional(),
});

// ---- planned ----------------------------------------------------------------

export const plannedInput = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["expense", "income"]).default("expense"),
  amountMinor: minorAmount,
  frequency: z.enum(FREQUENCIES).default("monthly"),
  anchorDate: isoDate,
  endDate: isoDate.nullable().default(null),
  accountId: nullableId,
  categoryId: nullableId,
  incomeSourceId: nullableId,
  note: nullableText,
  lastPostedDate: isoDate.nullable().default(null),
  active: z.boolean().default(true),
});

export const plannedPatch = plannedInput.partial();

export const postPlannedInput = z.object({
  date: isoDate.optional(),
  amountMinor: minorAmount.optional(),
});

// ---- settings ---------------------------------------------------------------

export const settingsPatch = z.object({
  currency: z.string().length(3).optional(),
  locale: z.string().max(20).optional(),
  monthStartDay: z.number().int().min(1).max(28).optional(),
  theme: z.enum(["dark", "light"]).optional(),
});

export const incomeSourceInput = z.object({
  name: z.string().min(1).max(120),
  shortName: z.string().max(60).optional(),
  color: z.string().max(64).nullable().optional(),
  defaultCategoryId: id.nullable().optional(),
  defaultAccountId: id.nullable().optional(),
});

export const incomeSourcePatch = z.object({
  name: z.string().min(1).max(120).optional(),
  shortName: z.string().min(1).max(60).optional(),
  logo: z.string().max(64).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  defaultCategoryId: id.nullable().optional(),
  defaultAccountId: id.nullable().optional(),
  sortOrder: z.number().int().optional(),
  archivedAt: z.string().nullable().optional(),
});

// ---- the account catalog -----------------------------------------------------

/**
 * A base64 payload or a `data:` URL. The real checks - format, size and the
 * 1:1 aspect ratio - happen once the bytes are decoded, because they are
 * questions about an image rather than about a string.
 */
const logoUpload = z.string().min(1).max(1_400_000);

export const catalogEntryInput = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES).default("bank"),
  icon: z.string().max(64).default("Landmark"),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "A slug is lowercase letters, digits and hyphens")
    .max(48)
    .optional(),
  sortOrder: z.number().int().optional(),
  logo: logoUpload.nullable().optional(),
});

export const catalogEntryPatch = z.object({
  name: z.string().min(1).max(80).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  icon: z.string().max(64).optional(),
  sortOrder: z.number().int().optional(),
  archivedAt: z.string().nullable().optional(),
  logo: logoUpload.nullable().optional(),
});

export const addFromCatalogInput = z.object({
  catalogSlug: z.string().min(1).max(48),
  openingBalanceMinor: minorAmount.optional(),
  name: z.string().min(1).max(120).optional(),
});

// ---- screens ----------------------------------------------------------------

export const monthQuery = z.object({
  month: monthKey,
  locale: z.string().max(20).default("en-PH"),
});

export const walletQuery = z.object({
  month: monthKey,
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const outlookQuery = z.object({
  from: isoDate,
  to: isoDate,
  locale: z.string().max(20).default("en-PH"),
  granularity: z.enum(["day", "month", "year"]).optional(),
});
