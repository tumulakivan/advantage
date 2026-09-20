import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../errors";

/**
 * Refuse the ledger to an admin account.
 *
 * An admin account administers the service; it does not track anybody's money,
 * and it is never given a ledger to track it in. Someone who wants both keeps
 * two accounts, which is the arrangement worth having anyway: the login that
 * can edit everyone's catalog should not be the one left signed in on a phone.
 *
 * This is 403 rather than the 404 the admin routes give everyone else. There is
 * nothing to hide in this direction - an admin knows perfectly well the app has
 * a dashboard - so the honest answer is "not with this account, and here is
 * why".
 */
export function requirePersonalAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.user?.isAdmin) {
    throw new ApiError(
      403,
      "admin_account",
      "This is an admin account, which has no ledger of its own. " +
        "Sign up separately to track your own money.",
    );
  }
  next();
}
