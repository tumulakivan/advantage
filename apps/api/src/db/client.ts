import { PrismaClient } from "@prisma/client";

import { isProduction } from "../env";

/**
 * The one unscoped connection in the process.
 *
 * Nothing in `routes/` imports this. Route code only ever sees the tenant
 * handle built by the session middleware, so a query cannot be written without
 * a user attached to it - which is the whole defence against one person's
 * dashboard showing another person's salary.
 */
export const prisma = new PrismaClient({
  log: isProduction ? ["warn", "error"] : ["warn", "error"],
});

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
