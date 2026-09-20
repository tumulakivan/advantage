import type { ApiErrorBody } from "@advantage/api-client/types";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { isProduction } from "./env";

/**
 * One error shape for the whole service, settled here rather than per route:
 * `{ error: { code, message, details? } }`. The client reads `message`
 * straight into the same red line the local build used to show.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "bad_request", message, details);
  }

  static unauthorized(message = "Sign in to continue."): ApiError {
    return new ApiError(401, "unauthorized", message);
  }

  static notFound(message = "Not found."): ApiError {
    return new ApiError(404, "not_found", message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, "conflict", message);
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: { code: "not_found", message: "No such endpoint." },
  };
  res.status(404).json(body);
}

/**
 * The last stop. Note what is *not* logged: no amounts, no payees, no email
 * addresses. A request log that quietly accumulates someone's spending is a
 * second copy of their financial history in a place nobody is guarding.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const resolved = toApiError(error);

  if (resolved.status >= 500) {
    console.error(`[${req.method} ${req.path}] ${resolved.code}:`, error);
  }

  const body: ApiErrorBody = {
    error: {
      code: resolved.code,
      message: resolved.message,
      ...(resolved.details === undefined ? {} : { details: resolved.details }),
    },
  };

  res.status(resolved.status).json(body);
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.badRequest(
      "That request did not look right.",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  // Prisma tags its failures with a code; the two worth translating are a
  // unique-constraint clash and a row that is not there.
  const code = (error as { code?: string }).code;
  if (code === "P2002") return ApiError.conflict("That already exists.");
  if (code === "P2025") return ApiError.notFound();

  const message =
    !isProduction && error instanceof Error ? error.message : "Something went wrong.";
  return new ApiError(500, "internal", message);
}
