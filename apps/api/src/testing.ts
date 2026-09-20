import { randomUUID } from "node:crypto";

import { prisma } from "./db/client";
import { tenantFor, type Tenant } from "./db/tenant";
import { seedIfEmpty } from "./seed";

export interface TestTenant {
  tenant: Tenant;
  userId: string;
  /** Deletes the user, and everything cascades with them. */
  dispose: () => Promise<void>;
}

/**
 * A throwaway account with a freshly seeded ledger.
 *
 * It writes the user row directly rather than going through Better Auth: these
 * tests are about the query layer, and a password hash is not part of what
 * they are checking. Tenancy is what makes this safe to point at a development
 * database - every row it creates belongs to a user nothing else knows about,
 * and disposing of that user takes all of it with them.
 */
export async function createTestTenant(label = "test"): Promise<TestTenant> {
  const userId = randomUUID();

  await prisma.user.create({
    data: {
      id: userId,
      name: label,
      email: `${label}+${userId}@example.test`,
      emailVerified: true,
    },
  });

  const tenant = tenantFor(userId);
  await seedIfEmpty(tenant);

  return {
    tenant,
    userId,
    dispose: async () => {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {
        // Already gone - a test that exercised account deletion, most likely.
      });
    },
  };
}
