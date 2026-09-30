import { CheckCircle2, Loader2 } from "lucide-react";
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  AuthError,
  AuthFrame,
  AuthHeading,
  readableAuthError,
} from "@/components/auth/AuthFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { authClient } from "@/lib/api";
import { checkNewPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { useSession } from "@/providers/SessionProvider";

/**
 * Choose a new password, arriving from the emailed link.
 *
 * The server has already checked the token before redirecting here: a good one
 * arrives as `?token=`, a bad or expired one as `?error=`. The token is checked
 * again when the password is submitted, and consumed by it, so the link works
 * exactly once however this page is reached.
 *
 * This route sits outside the signed-in and signed-out guards on purpose. Someone
 * who is signed in on this browser and clicks a reset link still means to reset
 * it, and a guard that bounced them to the dashboard would swallow the link.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const { refresh } = useSession();

  const token = params.get("token");
  const linkError = params.get("error");

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [touched, setTouched] = React.useState({ password: false, confirm: false });
  const [submitted, setSubmitted] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expired, setExpired] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const problems = checkNewPassword(password, confirm);
  const passwordError = touched.password || submitted ? problems.password : null;
  const confirmError = touched.confirm || submitted ? problems.confirm : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!token || problems.password || problems.confirm) return;

    setPending(true);
    setError(null);

    const result = await authClient.resetPassword({ newPassword: password, token });

    setPending(false);

    if (result.error) {
      // The link was fine when the page loaded and is not now: used in another
      // tab, or it ran out while the form was open.
      if (result.error.code === "INVALID_TOKEN") {
        setExpired(true);
        return;
      }
      setError(readableAuthError(result.error));
      return;
    }

    // The server ended every session for this account, this browser's included.
    refresh();
    setDone(true);
  }

  if (done) {
    return (
      <AuthFrame>
        <div className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-full">
          <CheckCircle2 className="size-5" />
        </div>
        <AuthHeading
          title="Password updated"
          description="You have been signed out everywhere else. Sign in with your new password."
        />
        <Button asChild className="w-full">
          <Link to="/signin">Sign in</Link>
        </Button>
      </AuthFrame>
    );
  }

  if (!token || linkError || expired) {
    return (
      <AuthFrame>
        <AuthHeading
          title="That link has expired"
          description="Reset links work once, for an hour. Ask for a new one and use the latest email."
        />
        <Button asChild className="w-full">
          <Link to="/forgot-password">Send me a new link</Link>
        </Button>
        <p className="text-center text-[13px]">
          <Link to="/signin" className="text-primary font-semibold hover:underline">
            Back to sign in
          </Link>
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <AuthHeading
        title="Choose a new password"
        description="Pick something you have not used here before."
      />

      <form onSubmit={submit} className="space-y-4">
        <Field
          label="New password"
          htmlFor="reset-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={passwordError}
        >
          <Input
            id="reset-password"
            type="password"
            required
            autoFocus
            aria-invalid={passwordError ? true : undefined}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setTouched((state) => ({ ...state, password: true }))}
          />
        </Field>

        <Field label="Confirm new password" htmlFor="reset-confirm" error={confirmError}>
          <Input
            id="reset-confirm"
            type="password"
            required
            aria-invalid={confirmError ? true : undefined}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            onBlur={() => setTouched((state) => ({ ...state, confirm: true }))}
          />
        </Field>

        {error ? <AuthError>{error}</AuthError> : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Update password
        </Button>
      </form>
    </AuthFrame>
  );
}
