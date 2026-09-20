import type { ApiErrorBody } from "./types";

/**
 * What a failed request turns into. The screens already had a `string | null`
 * error slot from the local build; this keeps `error.message` readable enough
 * to drop straight into it.
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

  /** The caller is not signed in, or their session has expired. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Called whenever a request comes back 401, so the app can show the sign-in screen. */
  onUnauthorized?: () => void;
}

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * The transport. One place that knows the base URL, that the session travels
 * as a cookie, and what an error looks like on the wire.
 *
 * Reads used to cost about 0.2 ms against a local SQLite file, so the app
 * refetched everything after every write without thinking about it. They cost
 * a network round trip now, which is why the heavy screens each have a single
 * endpoint rather than a fan-out of small ones.
 */
export class ApiClient {
  readonly baseUrl: string;
  private readonly onUnauthorized: (() => void) | undefined;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.onUnauthorized = options.onUnauthorized;
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Query; signal?: AbortSignal } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        // The session is an httpOnly cookie, so every call has to carry it.
        credentials: "include",
        headers: options.body === undefined ? {} : { "content-type": "application/json" },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
      throw new ApiError(0, "offline", "Could not reach the server. Check your connection.");
    }

    if (response.status === 401) {
      this.onUnauthorized?.();
      throw new ApiError(401, "unauthorized", "Your session has expired. Sign in again.");
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const payload: unknown = text ? safeParse(text) : null;

    if (!response.ok) {
      const body = payload as ApiErrorBody | null;
      throw new ApiError(
        response.status,
        body?.error?.code ?? "error",
        body?.error?.message ?? `Request failed (${response.status})`,
        body?.error?.details,
      );
    }

    return payload as T;
  }

  /**
   * Turn a path the API handed back into something an `<img>` can load.
   *
   * Logo URLs come from the server as paths rather than absolute URLs, so the
   * same row is correct whichever origin the API is deployed on. Resolving
   * them is the client's job, because the client is the only thing that knows
   * where it is pointed.
   */
  assetUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    return /^https?:\/\//.test(path) ? path : `${this.baseUrl}${path}`;
  }

  get<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
    return this.request<T>("GET", path, { query, signal });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path, {});
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
