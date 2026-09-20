import {
  DEFAULT_SETTINGS,
  SEED_ACCOUNTS,
  SEED_CATEGORIES,
  SEED_INCOME_SOURCES,
  currentMonthKey,
  dueDateIn,
} from "@advantage/core";
import { randomUUID } from "node:crypto";

import { transact, type Tenant } from "./db/tenant";

/**
 * First-run seed, per person.
 *
 * Idempotent by construction: it bails unless this user's categories table is
 * empty, so a second request never duplicates the taxonomy. That is also why
 * it is safe to call it lazily on the way into a request rather than inside
 * sign-up - a seed that fails after the user row is written would otherwise
 * leave someone with an account they cannot use.
 */
export async function seedIfEmpty(tenant: Tenant): Promise<boolean> {
  // Cheap way out for the overwhelmingly common case: an existing ledger.
  const existing = await tenant.db.category.findFirst({
    where: { userId: tenant.userId },
    select: { id: true },
  });
  if (existing) return false;

  const now = new Date().toISOString();
  const month = currentMonthKey();
  const userId = tenant.userId;

  return transact(tenant, async (t) => {
    /**
     * The first screen fires several requests at once, so on a brand new
     * account they all arrive to find the categories table empty and all try
     * to seed it. The check above is not enough on its own - two of them can
     * pass it before either writes - and the loser used to fail on the slug
     * unique index and surface as a 409 in the browser console.
     *
     * The lock is held until the transaction ends and is keyed on the user, so
     * it serialises only the people actually racing, and it holds across
     * processes in a way an in-memory flag cannot.
     */
    await t.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;

    const raced = await t.db.category.findFirst({ where: { userId }, select: { id: true } });
    if (raced) return false;

    // ---- accounts ----
    const accountIds = new Map<string, string>();
    await t.db.account.createMany({
      data: SEED_ACCOUNTS.map((account, index) => {
        const id = randomUUID();
        accountIds.set(account.slug, id);
        return {
          id,
          userId,
          slug: account.slug,
          name: account.name,
          type: account.type,
          icon: account.icon,
          openingBalanceMinor: account.openingBalanceMinor,
          currency: DEFAULT_SETTINGS.currency,
          sortOrder: index,
          createdAt: now,
        };
      }),
    });

    // ---- categories: parents first, so children can point at a real id ----
    const categoryIds = new Map<string, string>();
    const toRow = (category: (typeof SEED_CATEGORIES)[number], index: number) => {
      const id = randomUUID();
      categoryIds.set(category.slug, id);
      return {
        id,
        userId,
        slug: category.slug,
        name: category.name,
        kind: category.kind,
        icon: category.icon,
        color: category.color,
        parentId: category.parent ? (categoryIds.get(category.parent) ?? null) : null,
        isSystem: true,
        sortOrder: index,
        createdAt: now,
      };
    };

    await t.db.category.createMany({
      data: SEED_CATEGORIES.filter((category) => !category.parent).map(toRow),
    });
    await t.db.category.createMany({
      data: SEED_CATEGORIES.filter((category) => category.parent).map(toRow),
    });

    // ---- income sources ----
    const sourceIds = new Map<string, string>();
    await t.db.incomeSource.createMany({
      data: SEED_INCOME_SOURCES.map((source, index) => {
        const id = randomUUID();
        sourceIds.set(source.slug, id);
        return {
          id,
          userId,
          slug: source.slug,
          name: source.name,
          shortName: source.shortName,
          color: source.color,
          defaultCategoryId: categoryIds.get(source.defaultCategory) ?? null,
          defaultAccountId: accountIds.get("cash") ?? null,
          sortOrder: index,
          createdAt: now,
        };
      }),
    });

    // ---- a starting schedule, so the Planned screen is not empty on a first
    // run. The amounts are round placeholders: replace them, or import a plan
    // file with your own. ----
    await t.db.plannedPayment.createMany({
      data: [
        {
          id: randomUUID(),
          userId,
          name: "Internet",
          type: "expense",
          amountMinor: 100_000,
          frequency: "monthly",
          anchorDate: dueDateIn(month, 1),
          accountId: accountIds.get("cash") ?? null,
          categoryId: categoryIds.get("bills-internet") ?? null,
          note: "Set your own amount and due date.",
          active: true,
          createdAt: now,
        },
        {
          id: randomUUID(),
          userId,
          name: "Electricity",
          type: "expense",
          amountMinor: 100_000,
          frequency: "monthly",
          anchorDate: dueDateIn(month, 1),
          accountId: accountIds.get("cash") ?? null,
          categoryId: categoryIds.get("bills-electricity") ?? null,
          note: "Set your own amount and due date.",
          active: true,
          createdAt: now,
        },
        {
          id: randomUUID(),
          userId,
          name: "Salary",
          type: "income",
          amountMinor: 0,
          frequency: "monthly",
          anchorDate: dueDateIn(month, 1),
          accountId: accountIds.get("cash") ?? null,
          categoryId: categoryIds.get("income-salary") ?? null,
          incomeSourceId: sourceIds.get("salary") ?? null,
          active: true,
          createdAt: now,
        },
      ],
    });

    // ---- settings ----
    await t.db.setting.createMany({
      data: [
        { userId, key: "currency", value: DEFAULT_SETTINGS.currency },
        { userId, key: "locale", value: DEFAULT_SETTINGS.locale },
        { userId, key: "monthStartDay", value: String(DEFAULT_SETTINGS.monthStartDay) },
        { userId, key: "theme", value: DEFAULT_SETTINGS.theme },
        { userId, key: "seededAt", value: now },
      ],
    });

    return true;
  });
}

/**
 * Users whose ledger is known to exist. Saves a SELECT on every request after
 * the first; a cold process just pays it once more per user.
 */
const seeded = new Set<string>();

/**
 * Seeds in flight. Without this, the burst of requests a first page load makes
 * would each open their own transaction and queue on the advisory lock, and
 * five of them would wait out the seed only to find it already done.
 */
const seeding = new Map<string, Promise<void>>();

export async function ensureSeeded(tenant: Tenant): Promise<void> {
  const userId = tenant.userId;
  if (seeded.has(userId)) return;

  let pending = seeding.get(userId);
  if (!pending) {
    pending = seedIfEmpty(tenant)
      .then(() => {
        seeded.add(userId);
      })
      .finally(() => {
        seeding.delete(userId);
      });
    seeding.set(userId, pending);
  }

  await pending;
}

/** Called after a wipe, so the next request seeds again. */
export function forgetSeeded(userId: string): void {
  seeded.delete(userId);
}
