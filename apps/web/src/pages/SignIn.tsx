import { Loader2 } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthError,
  AuthFrame,
  AuthHeading,
  appLink,
  readableAuthError,
} from "@/components/auth/AuthFrame";
import { CheckEmail } from "@/components/auth/CheckEmail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { authClient } from "@/lib/api";
import { checkNewPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { useSession } from "@/providers/SessionProvider";

/** Sign in and sign up, sharing one frame. */
export function SignInPage() {
  return <AuthScreen mode="sign-in" />;
}

export function SignUpPage() {
  return <AuthScreen mode="sign-up" />;
}

type Mode = "sign-in" | "sign-up";

const COPY = {
  "sign-in": {
    title: "Welcome back",
    description: "Your records are where you left them.",
    action: "Sign in",
    alternative: "New here?",
    alternativeLink: "Create an account",
    alternativeTo: "/signup",
  },
  "sign-up": {
    title: "Create an account",
    description: "A budget tracker that does not charge a subscription for a spreadsheet.",
    action: "Create account",
    alternative: "Already have an account?",
    alternativeLink: "Sign in",
    alternativeTo: "/signin",
  },
} as const;

function AuthScreen({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const isSignUp = mode === "sign-up";
  const navigate = useNavigate();
  const { refresh } = useSession();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  // Errors wait until someone has finished with a field (or tried to submit),
  // so the form does not scold while they are still typing the first letters.
  const [touched, setTouched] = React.useState({ password: false, confirm: false });
  const [submitted, setSubmitted] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Set once the account exists but its address has not been confirmed: the
  // form gives way to "open the link we sent you".
  const [awaiting, setAwaiting] = React.useState<{ email: string; cause: "sign-up" | "sign-in" } | null>(null);

  const problems = checkNewPassword(password, confirm);
  const passwordError = isSignUp && (touched.password || submitted) ? problems.password : null;
  const confirmError = isSignUp && (touched.confirm || submitted) ? problems.confirm : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (isSignUp) {
      setSubmitted(true);
      if (problems.password || problems.confirm) return;
    }

    setPending(true);
    setError(null);

    const address = email.trim();

    const result = isSignUp
      ? await authClient.signUp.email({
          email: address,
          password,
          name: name.trim() || address,
          // Where the emailed link lands the browser once it has done its job.
          callbackURL: appLink("/verify"),
        })
      : await authClient.signIn.email({
          email: address,
          password,
          // A correct password on an unconfirmed account makes the server send a
          // fresh link, and that link needs somewhere to land. Without this it
          // would redirect to the API's own root.
          callbackURL: appLink("/verify"),
        });

    setPending(false);

    if (result.error) {
      // The password was right; the mailbox has not been proved yet. The server
      // has already sent a fresh link, so the useful thing is to say so.
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        setAwaiting({ email: address, cause: "sign-in" });
        return;
      }
      setError(readableAuthError(result.error));
      return;
    }

    // Sign-up no longer signs anyone in: it makes the account and asks them to
    // confirm the address. The reply is identical for an address that was
    // already registered, on purpose, so this screen cannot be used to find out.
    if (isSignUp && !result.data?.token) {
      setAwaiting({ email: address, cause: "sign-up" });
      return;
    }

    refresh();
    void navigate("/", { replace: true });
  }

  if (awaiting) {
    return (
      <AuthFrame>
        <CheckEmail
          email={awaiting.email}
          cause={awaiting.cause}
          onStartOver={() => {
            setAwaiting(null);
            setPassword("");
            setConfirm("");
            setSubmitted(false);
            setTouched({ password: false, confirm: false });
          }}
        />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      footer="Your records live on the server now, not in this browser. You can download all of them as a file from Settings whenever you like."
    >
      <AuthHeading title={copy.title} description={copy.description} />

      <form onSubmit={submit} className="space-y-4">
        {isSignUp ? (
          <Field label="Name" htmlFor="auth-name">
            <Input
              id="auth-name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What should we call you?"
            />
          </Field>
        ) : null}

        <Field label="Email" htmlFor="auth-email">
          <Input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            autoFocus={!isSignUp}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="auth-password"
          hint={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
          error={passwordError}
        >
          <Input
            id="auth-password"
            type="password"
            required
            aria-invalid={passwordError ? true : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setTouched((state) => ({ ...state, password: true }))}
          />
        </Field>

        {isSignUp ? (
          <Field label="Confirm password" htmlFor="auth-confirm" error={confirmError}>
            <Input
              id="auth-confirm"
              type="password"
              required
              aria-invalid={confirmError ? true : undefined}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              onBlur={() => setTouched((state) => ({ ...state, confirm: true }))}
            />
          </Field>
        ) : (
          <div className="-mt-2 text-right">
            <Link to="/forgot-password" className="text-primary text-[13px] font-semibold hover:underline">
              Forgot password?
            </Link>
          </div>
        )}

        {error ? <AuthError>{error}</AuthError> : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {copy.action}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-[13px]">
        {copy.alternative}{" "}
        <Link to={copy.alternativeTo} className="text-primary font-semibold hover:underline">
          {copy.alternativeLink}
        </Link>
      </p>
    </AuthFrame>
  );
}
