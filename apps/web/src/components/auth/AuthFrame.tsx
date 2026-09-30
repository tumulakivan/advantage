import type * as React from "react";

import { Logo, Wordmark } from "@/components/brand/Logo";

/**
 * The frame every signed-out screen shares: sign-in, sign-up, the "check your
 * email" step, forgot password, reset password.
 *
 * Deliberately plain. The app this fronts is about money, and a page that
 * tries to be clever is the wrong first impression for that.
 */
export function AuthFrame({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <Logo className="size-8" />
          <Wordmark className="text-[20px]" />
        </div>

        <div className="border-border bg-card space-y-5 rounded-2xl border p-6 shadow-lg">
          {children}
        </div>

        {footer ? (
          <p className="text-muted-foreground text-center text-[12px] leading-relaxed">{footer}</p>
        ) : null}
      </div>
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-muted-foreground text-[13px] leading-relaxed">{description}</p>
    </div>
  );
}

/** A red box for something that went wrong, in the one voice every auth screen uses. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[13px]"
    >
      {children}
    </p>
  );
}

/** A quiet confirmation, for "sent" and "done". */
export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="border-primary/30 bg-primary/10 text-foreground rounded-lg border px-3 py-2 text-[13px]"
    >
      {children}
    </p>
  );
}

/**
 * The words for an auth failure. Better Auth's own messages are written for a
 * developer ("Invalid email or password" is fine; others are not), and a
 * rate-limit has none worth showing, so the ones that matter are named here.
 */
export function readableAuthError(error: { status?: number; message?: string } | null | undefined): string {
  if (error?.status === 429) return "Too many attempts. Wait a minute and try again.";
  return error?.message || "That did not work. Check your details and try again.";
}

/** Where an emailed link should send the browser back to. Absolute: the API is a different origin in development. */
export function appLink(path: string): string {
  return `${window.location.origin}${path}`;
}
