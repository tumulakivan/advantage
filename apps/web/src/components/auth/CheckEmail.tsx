import { Loader2, MailCheck } from "lucide-react";
import * as React from "react";

import { AuthError, AuthHeading, AuthNotice, appLink, readableAuthError } from "@/components/auth/AuthFrame";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/api";

/** The server allows three of these a minute; this keeps well inside that. */
const RESEND_COOLDOWN_SECONDS = 45;

/**
 * "Open the link we sent you" - the screen between creating an account and
 * being allowed in.
 *
 * Shown for a fresh sign-up and for a sign-in attempt on an unconfirmed
 * account, and it deliberately reads the same either way to anyone who cannot
 * see the inbox: it never says whether the address is new or already known.
 */
export function CheckEmail({
  email,
  cause,
  onStartOver,
}: {
  email: string;
  cause: "sign-up" | "sign-in";
  onStartOver: () => void;
}) {
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_SECONDS);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentAgain, setSentAgain] = React.useState(false);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    setPending(true);
    setError(null);
    setSentAgain(false);

    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: appLink("/verify"),
    });

    setPending(false);

    if (result.error) {
      setError(readableAuthError(result.error));
      return;
    }

    setSentAgain(true);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <>
      <div className="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-full">
        <MailCheck className="size-5" />
      </div>

      <AuthHeading
        title={cause === "sign-up" ? "Check your email" : "Confirm your email first"}
        description={
          <>
            {cause === "sign-up"
              ? "We sent a confirmation link to "
              : "This account's address has not been confirmed yet. We sent a fresh link to "}
            <strong className="text-foreground break-all">{email}</strong>
            {cause === "sign-up" ? ". Open it to finish creating your account." : "."}
          </>
        }
      />

      {sentAgain ? <AuthNotice>Sent again. It can take a minute to arrive.</AuthNotice> : null}
      {error ? <AuthError>{error}</AuthError> : null}

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending || cooldown > 0}
          onClick={() => void resend()}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {cooldown > 0 ? `Send it again in ${cooldown}s` : "Send it again"}
        </Button>

        <p className="text-muted-foreground text-center text-[12.5px] leading-relaxed">
          Nothing yet? Check your spam folder.{" "}
          <button type="button" onClick={onStartOver} className="text-primary font-semibold hover:underline">
            Use a different address
          </button>
        </p>
      </div>
    </>
  );
}
