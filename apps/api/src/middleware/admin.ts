import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../errors";

/**
 * Gate the admin routes.
 *
 * Runs after `requireUser`, so by here there is a session and `req.user.isAdmin`
 * has already been decided against the service's configured list. It answers
 * 404 rather than 403 on purpose: someone who is not an admin has no business
 * learning that these routes exist.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) throw ApiError.notFound("No such endpoint.");
  next();
}
