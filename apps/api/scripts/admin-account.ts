import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { auth } from "../src/auth";
import { disconnect } from "../src/db/client";
import { adminEmailList, isAdminEmail } from "../src/env";

/**
 * Create the admin account, or set a new password on it.
 *
 *   npm run admin -- --email admin@advantage.com
 *   npm run admin -- --email admin@advantage.com --password "..."
 *   npm run admin -- --if-configured
 *
 * There is no password reset in the app yet - no transactional sender is wired,
 * and a reset mail that never arrives is worse than none. That is survivable
 * for an ordinary account, whose owner can be told to sign up again, but not
 * for the only admin: losing that password would mean losing the ability to
 * curate the catalog with no way back in short of editing the database by hand.
 * This is that way back.
 *
 * It refuses any address that is not in ADMIN_EMAILS, so it is a tool for the
 * account the service already trusts rather than a way to mint one. That also
 * catches the likeliest mistake - running it before setting the variable.
 *
 * Passwords are hashed with scrypt by Better Auth and never stored in readable
 * form, here or anywhere else. Nothing can show you an existing one. A
 * generated password is printed exactly once, by this script, and then it is
 * gone - put it in a password manager.
 *
 * The third form is the unattended one, which the root `predev` script runs on
 * every `npm run dev`. It takes the address from ADMIN_EMAILS and the password
 * from ADMIN_PASSWORD, and it is built to be unnoticeable: it does nothing if
 * either is unset, nothing if the password is already the stored one, and it
 * never fails the dev server if the database is not up yet. Starting the app
 * is the wrong moment to be told about a container.
 *
 * It will not generate a password in that mode, only use one it was handed. A
 * random password rotated behind your back on every start would lock you out
 * of the account it exists to keep.
 */
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string", default: "adVantage admin" },
    "if-configured": { type: "boolean", default: false },
  },
});

const unattended = values["if-configured"];

/**
 * Flags win; otherwise both come from `.env`, which is how the dev-start path
 * gets them without a password sitting in a tracked file or in shell history.
 */
const email = (values.email ?? adminEmailList[0])?.trim().toLowerCase();
const supplied = values.password ?? process.env.ADMIN_PASSWORD?.trim() ?? undefined;

async function main(): Promise<number> {
  if (!email) {
    if (unattended) return 0;
    console.error("Usage: admin-account --email <address> [--password <value>] [--name <name>]");
    return 1;
  }

  if (!isAdminEmail(email)) {
    if (unattended) return 0;
    console.error(
      `${email} is not in ADMIN_EMAILS, so it would be an ordinary account.\n\n` +
        (adminEmailList.length === 0
          ? "ADMIN_EMAILS is empty. Put the address in .env first:\n" +
            `  ADMIN_EMAILS="${email}"`
          : `ADMIN_EMAILS currently holds:\n  ${adminEmailList.join("\n  ")}`),
    );
    return 1;
  }

  /** No ADMIN_PASSWORD means the unattended path has nothing to keep in sync. */
  if (unattended && !supplied) return 0;

  /** Readable enough to retype once, long enough not to be guessed. */
  const generated = !supplied;
  const password = supplied ?? randomBytes(15).toString("base64url");

  const ctx = await auth.$context;

  if (password.length < ctx.password.config.minPasswordLength) {
    console.error(
      `That password is ${password.length} characters; the minimum is ${ctx.password.config.minPasswordLength}.`,
    );
    return 1;
  }

  const existing = await ctx.internalAdapter.findUserByEmail(email, { includeAccounts: true });

  if (existing) {
    const credential = existing.accounts.find((account) => account.providerId === "credential");

    /**
     * On almost every start the stored hash already matches, and the honest
     * answer is to do nothing. Worth checking, because the alternative is a
     * scrypt hash and a write on every `npm run dev` to record what is
     * already true.
     */
    if (
      credential?.password &&
      (await ctx.password.verify({ hash: credential.password, password }))
    ) {
      if (!unattended) console.log(`${email} already has that password.`);
      return 0;
    }

    await ctx.internalAdapter.updatePassword(existing.user.id, await ctx.password.hash(password));
    console.log(`Set a new password for ${email}.`);
  } else {
    await auth.api.signUpEmail({
      body: { email, password, name: values.name ?? "adVantage admin" },
    });
    console.log(`Created ${email}.`);
  }

  if (generated) {
    console.log(`\n  password: ${password}\n`);
    console.log("That is the only time it will be shown. Save it now.");
  }

  if (!unattended) {
    console.log(`\nSign in at the app with ${email}. The Admin item appears in the sidebar.`);
  }

  return 0;
}

/**
 * Prisma's connection errors run to several lines, and the first of them is
 * the call that failed rather than the reason it did. Skip that preamble and
 * the line underneath it is the useful one - "Can't reach database server at
 * `localhost:5433`".
 */
function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("Invalid `prisma."));

  return lines[0] ?? "unknown error";
}

let code = 0;

try {
  code = await main();
} catch (error) {
  if (!unattended) throw error;

  /**
   * Nearly always "Postgres is not up yet". The account gets reconciled on the
   * next start, and every other thing about the app works meanwhile, so this
   * is a line of warning rather than a reason to refuse to start.
   */
  console.warn(`Skipped the admin account check - ${reason(error)}`);
}

await disconnect();
process.exit(code);
