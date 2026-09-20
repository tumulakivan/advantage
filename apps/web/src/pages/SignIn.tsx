import { Loader2 } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";

import { Logo, Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { authClient } from "@/lib/api";
import { useSession } from "@/providers/SessionProvider";

/**
 * Sign in and sign up, sharing one frame.
 *
 * Deliberately plain. The app this fronts is about money, and a sign-in page
 * that tries to be clever is the wrong first impression for that.
 */
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
  const navigate = useNavigate();
  const { refresh } = useSession();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: name.trim() || email })
        : await authClient.signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "That did not work. Check your details and try again.");
      return;
    }

    refresh();
    void navigate("/", { replace: true });
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <Logo className="size-8" />
          <Wordmark className="text-[20px]" />
        </div>

        <div className="border-border bg-card space-y-5 rounded-2xl border p-6 shadow-lg">
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold">{copy.title}</h1>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              {copy.description}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "sign-up" ? (
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
                autoFocus={mode === "sign-in"}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="auth-password"
              hint={mode === "sign-up" ? "At least 8 characters." : undefined}
            >
              <Input
                id="auth-password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error ? (
              <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[13px]">
                {error}
              </p>
            ) : null}

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
        </div>

        <p className="text-muted-foreground text-center text-[12px] leading-relaxed">
          Your records live on the server now, not in this browser. You can download all of them
          as a file from Settings whenever you like.
        </p>
      </div>
    </div>
  );
}
