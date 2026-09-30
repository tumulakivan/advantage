import { Loader2, MailCheck } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import {
  AuthError,
  AuthFrame,
  AuthHeading,
  appLink,
  readableAuthError,
} from "@/components/auth/AuthFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { authClient } from "@/lib/api";

/**
 * Ask for a reset link.
 *
 * The answer is the same whether or not the address has an account, and the
 * screen says so in its wording: "if an account exists". A form that said "no
 * such user" would be a free way to check who is registered, and a form that
 * said "sent!" only when it was true would be the same thing said differently.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const address = email.trim();
    const result = await authClient.requestPasswordReset({
      email: address,
      // The link in the email lands here with the token; see ResetPassword.
      redirectTo: appLink("/reset-password"),
    });

    setPending(false);

    if (result.error) {
      setError(readableAuthError(result.error));
      return;
    }

    setSentTo(address);
  }

  if (sentTo) {
    return (
      <AuthFrame>
        <div className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-full">
          <MailCheck className="size-5" />
        </div>

        <AuthHeading
          title="Check your email"
          description={
            <>
              If an account exists for <strong className="text-foreground break-all">{sentTo}</strong>,
              a link to choose a new password is on its way. It works once, for an hour.
            </>
          }
        />

        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          Nothing yet? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-primary font-semibold hover:underline"
          >
            try another address
          </button>
          .
        </p>

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
        title="Forgot your password?"
        description="Enter the email you signed up with and we will send you a link to choose a new one."
      />

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="forgot-email">
          <Input
            id="forgot-email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {error ? <AuthError>{error}</AuthError> : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Send reset link
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
