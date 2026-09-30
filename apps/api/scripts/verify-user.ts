import { parseArgs } from "node:util";

import { auth } from "../src/auth";
import { disconnect } from "../src/db/client";

/**
 * Mark an account's email as verified, from the command line.
 *
 *   npm run user:verify -w @advantage/api -- --email someone@example.com
 *
 * The way to get an account past "confirm your email" when the email cannot do
 * it: mail is not configured yet, the address is one you invented, or an
 * account predates the rule. It is an operator's tool - it needs the database
 * and the .env - and it says out loud that it is skipping the proof a mailbox
 * would have given, so nobody uses it as a habit.
 */
const { values } = parseArgs({ options: { email: { type: "string" } } });
const email = values.email?.trim().toLowerCase();

if (!email) {
  console.error("Usage: verify-user --email <address>");
  process.exit(1);
}

const ctx = await auth.$context;
const found = await ctx.internalAdapter.findUserByEmail(email);
let code = 0;

if (!found) {
  console.error(`No account has the address ${email}.`);
  code = 1;
} else if (found.user.emailVerified) {
  console.log(`${email} is already verified.`);
} else {
  await ctx.internalAdapter.updateUser(found.user.id, { emailVerified: true });
  console.log(`Marked ${email} as verified, without proof of the mailbox. They can sign in now.`);
}

await disconnect();
process.exit(code);
