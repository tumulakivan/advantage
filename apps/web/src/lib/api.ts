import { ApiClient } from "@advantage/api-client";
import { createAuthClient } from "better-auth/react";

/**
 * Where the backend lives. Baked in at build time, so a production bundle
 * points at the deployed API without the browser having to discover it.
 */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/**
 * Sign-in, sign-up and the session cookie. Better Auth owns all of it; this
 * app never sees a password after the form submits it.
 */
export const authClient = createAuthClient({ baseURL: API_URL });

/**
 * The single client every read and write goes through.
 *
 * A 401 from anywhere means the session ended - expired, signed out in another
 * tab, or the account deleted. Rather than leaving each screen to handle that,
 * the client tells the session provider, which swaps the app for the sign-in
 * page.
 */
let onUnauthorized: (() => void) | null = null;

export const api: ApiClient = new ApiClient({
  baseUrl: API_URL,
  onUnauthorized: () => onUnauthorized?.(),
});

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}
