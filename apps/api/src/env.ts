import { z } from "zod";

/**
 * Read once, at boot, and fail loudly. A service that starts with a missing
 * session secret and only discovers it on the first login is worse than one
 * that refuses to start.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required - see .env.example"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "BETTER_AUTH_SECRET must be at least 16 characters - openssl rand -base64 32"),
  BETTER_AUTH_URL: z.url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Comma-separated addresses that get the admin screens.
   *
   * Deliberately configuration rather than a column someone can be granted
   * through the app: there is then no privilege-escalation path in the product
   * at all, and the answer survives a database restore. The cost is that
   * changing it needs a restart, which for a list that changes once a year is
   * the right trade.
   */
  ADMIN_EMAILS: z.string().default(""),

  /**
   * How mail leaves the service. `dev` prints it and files it away, and is the
   * default everywhere except production; `resend` sends it for real.
   *
   * Sign-in depends on this now - nobody can sign in without a verification
   * link - so production refuses to start without a real transport rather
   * than boot into an app nobody can get into.
   */
  MAIL_TRANSPORT: z.enum(["dev", "resend"]).optional(),
  /** `Name <address@your-verified-domain>`. The domain must be verified with the provider. */
  MAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
});

const checked = schema.superRefine((value, ctx) => {
  const problem = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  if (value.NODE_ENV === "production" && value.MAIL_TRANSPORT !== "resend") {
    problem(
      "MAIL_TRANSPORT",
      'must be "resend" in production - the "dev" transport prints reset links to a log instead of sending them',
    );
  }

  if (value.MAIL_TRANSPORT === "resend") {
    if (!value.RESEND_API_KEY) problem("RESEND_API_KEY", "is required when MAIL_TRANSPORT is resend");
    if (!value.MAIL_FROM) problem("MAIL_FROM", "is required when MAIL_TRANSPORT is resend");
  }
});

const parsed = checked.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment:\n${lines.join("\n")}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";

/**
 * Origins allowed to send credentialed requests. Comma-separated so a deploy
 * can name a preview domain alongside the real one.
 */
export const webOrigins = env.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Lower-cased, because nobody types their own address the same way twice. */
const adminEmails = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails.has(email.trim().toLowerCase());
}

/** For the boot log, so a typo shows up as a wrong address rather than silence. */
export const adminEmailList = [...adminEmails];
