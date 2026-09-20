import type { AdminMetrics } from "@advantage/api-client/types";

import { prisma } from "../db/client";

/**
 * What the admin screen is allowed to know.
 *
 * Counts and dates, and nothing else. No amounts, no payees, no category
 * breakdowns, no per-user rows - not because they would be hard to produce but
 * because an admin page is exactly where someone's salary would end up being
 * looked at by a person who has no business seeing it. "How many people use
 * this and is it working" is answerable without ever reading a number someone
 * entered.
 *
 * The one judgement call is the account popularity list, which exists because
 * it answers the question the catalog raises: what should be added next. It
 * counts how many wallets carry a slug. It does not say whose, or what is in
 * them.
 */
export async function loadMetrics(): Promise<AdminMetrics> {
  const now = Date.now();
  const since = (days: number) => new Date(now - days * 86_400_000);

  const [
    totalUsers,
    newUsers7,
    newUsers30,
    activeSessions7,
    activeSessions30,
    verifiedUsers,
    transactions,
    accounts,
    plannedPayments,
    budgets,
    incomeSources,
    catalogTotal,
    catalogWithLogo,
    signupRows,
    popularRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
    prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
    prisma.session.findMany({
      where: { updatedAt: { gte: since(7) } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.session.findMany({
      where: { updatedAt: { gte: since(30) } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.transaction.count(),
    prisma.account.count(),
    prisma.plannedPayment.count(),
    prisma.budget.count(),
    prisma.incomeSource.count(),
    prisma.accountCatalogEntry.count({ where: { archivedAt: null } }),
    prisma.accountCatalogEntry.count({ where: { archivedAt: null, logoVersion: { not: null } } }),

    // Sign-ups by week, twelve weeks back. `date_trunc` on the user row's own
    // timestamp, so there is nothing to reconcile in JS.
    prisma.$queryRaw<{ week: Date; total: bigint }[]>`
      SELECT date_trunc('week', "createdAt") AS week, COUNT(*) AS total
        FROM "users"
       WHERE "createdAt" >= ${since(84)}
       GROUP BY 1
       ORDER BY 1
    `,

    prisma.account.groupBy({
      by: ["slug"],
      where: { slug: { not: null }, archivedAt: null },
      _count: { _all: true },
      orderBy: { _count: { slug: "desc" } },
      take: 12,
    }),
  ]);

  // Fill every week in the window, so a quiet fortnight reads as two empty bars
  // rather than a gap that looks like broken data.
  const weeks: AdminMetrics["signupsByWeek"] = [];
  const byWeek = new Map(
    signupRows.map((row) => [row.week.toISOString().slice(0, 10), Number(row.total)]),
  );
  const cursor = startOfWeek(since(77));
  for (let i = 0; i < 12; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    weeks.push({ week: key, signups: byWeek.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return {
    users: {
      total: totalUsers,
      verified: verifiedUsers,
      newLast7: newUsers7,
      newLast30: newUsers30,
      activeLast7: activeSessions7.length,
      activeLast30: activeSessions30.length,
    },
    ledger: { transactions, accounts, plannedPayments, budgets, incomeSources },
    catalog: { total: catalogTotal, withLogo: catalogWithLogo },
    signupsByWeek: weeks,
    accountPopularity: popularRows
      .filter((row) => row.slug)
      .map((row) => ({ slug: row.slug!, wallets: row._count._all })),
    generatedAt: new Date().toISOString(),
  };
}

/** Monday, in UTC, to match `date_trunc('week', ...)`. */
function startOfWeek(date: Date): Date {
  const copy = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - weekday);
  return copy;
}
