import type { SessionUser } from "@advantage/api-client/types";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";

import { auth } from "../auth";
import { tenantFor, type Tenant } from "../db/tenant";
import { isAdminEmail } from "../env";
import { ApiError } from "../errors";
import { ensureSeeded } from "../seed";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The only database handle route code is given. */
      tenant: Tenant;
      user: SessionUser;
    }
  }
}

/**
 * Resolve the session cookie into a tenant-scoped handle, or refuse the
 * request. Every route below `/api` except the auth routes themselves goes
 * through here, which is what makes it impossible to reach a query function
 * without a user.
 */
export async function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

  if (!session?.user) throw ApiError.unauthorized();

  const isAdmin = isAdminEmail(session.user.email);
  const tenant = tenantFor(session.user.id);

  // An admin account never gets a ledger, so there is nothing to seed. Should
  // the address later come off ADMIN_EMAILS, the next request seeds one then -
  // and an ordinary account promoted to admin keeps whatever it already had,
  // out of reach but untouched.
  if (!isAdmin) await ensureSeeded(tenant);

  req.tenant = tenant;
  req.user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
    createdAt: new Date(session.user.createdAt).toISOString(),
    // Decided here, from configuration, on every request. There is no column to
    // grant and so no way to become an admin through the product.
    isAdmin,
  };

  next();
}
