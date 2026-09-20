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
});

const parsed = schema.safeParse(process.env);

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
