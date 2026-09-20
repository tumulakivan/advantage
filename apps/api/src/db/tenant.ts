import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "./client";

/**
 * A database handle that already knows whose data it is allowed to touch.
 *
 * Every query function in `queries/` takes one of these as its first argument -
 * the same shape the SQLite build used, where the first argument was a plain
 * database. The difference is that there is no way to call one of them without
 * naming a user, so the filter is not something a new query can forget.
 */
export interface Tenant {
  readonly db: PrismaClient | Prisma.TransactionClient;
  readonly userId: string;
}

export function tenantFor(userId: string): Tenant {
  return { db: prisma, userId };
}

/**
 * Run several writes as one unit, keeping the same user. Used where a single
 * user action touches more than one table - posting a planned payment, or
 * replacing everything from a backup file.
 */
export function transact<T>(tenant: Tenant, work: (t: Tenant) => Promise<T>): Promise<T> {
  // A handle already inside a transaction must not open a nested one.
  if (!isRootClient(tenant.db)) return work(tenant);

  return tenant.db.$transaction((tx) => work({ db: tx, userId: tenant.userId }), {
    // Imports replace a whole ledger; the default 5s is not enough.
    timeout: 120_000,
    maxWait: 10_000,
  });
}

function isRootClient(db: Tenant["db"]): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

/** `{ userId }`, for spreading into a `where` clause. */
export function scope(tenant: Tenant): { userId: string } {
  return { userId: tenant.userId };
}
