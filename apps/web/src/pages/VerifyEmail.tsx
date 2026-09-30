import { CheckCircle2, Loader2 } from "lucide-react";
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  AuthError,
  AuthFrame,
  AuthHeading,
  AuthNotice,
  appLink,
  readableAuthError,
} from "@/components/auth/AuthFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { authClient } from "@/lib/api";

/**
 * Where the confirmation link lands the browser.
 *
 * The link goes to the API first, which checks it, marks the address confirmed
 * and signs the person in, then redirects here. So the usual visit never
 * renders this page at all: the signed-out guard sees a session and forwards
 * them to the app. What is left for this page is everything that did not go
 * that way - a link that expired or was already used, and a link opened in a
 * browser that could not keep the session.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const failed = params.get("error");

  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  async function resend(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.sendVerificationEmail({
      email: email.trim(),
      callbackURL: appLink("/verify"),
    });

    setPending(false);

    if (result.error) {
      setError(readableAuthError(result.error));
      return;
    }
    setSent(true);
  }

  if (!failed) {
    return (
      <AuthFrame>
        <div className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-full">
          <CheckCircle2 className="size-5" />
        </div>
        <AuthHeading
          title="Email confirmed"
          description="Your address is confirmed. Sign in to continue."
        />
        <Button asChild className="w-full">
          <Link to="/signin">Sign in</Link>
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <AuthHeading
        title="That link did not work"
        description="It may have expired, or it may already have been used. Confirmation links last 24 hours. Enter your email and we will send a new one."
      />

      <form onSubmit={resend} className="space-y-4">
        <Field label="Email" htmlFor="verify-email">
          <Input
            id="verify-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {sent ? (
          <AuthNotice>If that address needs confirming, a new link is on its way.</AuthNotice>
        ) : null}
        {error ? <AuthError>{error}</AuthError> : null}

        <Button type="submit" className="w-full" disabled={pending || sent}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Send a new link
        </Button>
      </form>

      <p className="text-center text-[13px]">
        <Link to="/signin" className="text-primary font-semibold hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthFrame>
  );
}
