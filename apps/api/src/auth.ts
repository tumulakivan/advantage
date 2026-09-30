import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./db/client";
import { env, isProduction, webOrigins } from "./env";
import { deliver } from "./mail";
import { existingAccountEmail, resetPasswordEmail, verificationEmail } from "./mail/templates";

/** How long each emailed link stays good. Reset is short because it is the more dangerous of the two. */
const VERIFY_LINK_SECONDS = 60 * 60 * 24;
const RESET_LINK_SECONDS = 60 * 60;

/**
 * The address people are sent to from an email. The first entry of WEB_ORIGIN
 * is the canonical one; the rest exist so a preview domain can also make
 * credentialed requests.
 */
const appUrl = webOrigins[0] ?? "http://localhost:5173";

/**
 * Identity, in the same Postgres as the ledger.
 *
 * Nothing about passwords or session tokens is written by hand here - that is
 * the one rule this file exists to keep. Better Auth owns hashing, rotation
 * and cookie handling; the app only ever asks it "who is this request?".
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: webOrigins,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Anyone can sign up; there is no invite gate. What there is instead is
    // proof of the mailbox: an account cannot sign in until its address has
    // been confirmed. That closes the two things an open sign-up form invites -
    // an account made with someone else's address, and an admin address claimed
    // by whoever gets to it first - and it means a password reset can be
    // trusted to reach the person it names.
    //
    // With this on, Better Auth also answers a sign-up for an existing address
    // exactly as it answers a fresh one, so the form cannot be used to find out
    // who has an account.
    requireEmailVerification: true,

    resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
    // A reset is the moment someone may be recovering from a stolen password.
    // Every other session has to die with the old one or the reset is theatre.
    revokeSessionsOnPasswordReset: true,

    sendResetPassword: async ({ user, url }) => {
      deliver(
        resetPasswordEmail({
          to: user.email,
          name: user.name,
          url,
          expiresInMinutes: RESET_LINK_SECONDS / 60,
        }),
      );
    },

    // Reading the reset email is proof of the mailbox, which is everything
    // verification proves. Leaving the account unverified would send someone who
    // just chose a new password straight into "confirm your email" as well.
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    },

    // The sign-up form says "check your email" whether or not the address is
    // taken. For an address that is taken, this is the email that tells them.
    onExistingUserSignUp: async ({ user }) => {
      deliver(
        existingAccountEmail({
          to: user.email,
          name: user.name,
          signInUrl: `${appUrl}/signin`,
          resetUrl: `${appUrl}/forgot-password`,
        }),
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // A correct password on an unconfirmed account sends a fresh link, so
    // "I lost the email" is fixed by trying to sign in. It is only sent after
    // the password checks out, so it cannot be used to mail strangers.
    sendOnSignIn: true,
    // The link that proves the mailbox also signs them in; asking for a
    // password again a moment after they typed it twice would be silly.
    autoSignInAfterVerification: true,
    expiresIn: VERIFY_LINK_SECONDS,

    sendVerificationEmail: async ({ user, url }) => {
      deliver(
        verificationEmail({
          to: user.email,
          name: user.name,
          url,
          expiresInHours: VERIFY_LINK_SECONDS / 3600,
        }),
      );
    },
  },

  /**
   * Every one of these endpoints can be made to send mail to an address the
   * caller does not control, so they are rationed harder than the default. On
   * top of the abuse, a free mail tier is a daily quota that a script could
   * spend in a minute. Better Auth's limiter is on in production by default and
   * off elsewhere, so it does not interfere with local tests.
   */
  rateLimit: {
    customRules: {
      "/sign-up/email": { window: 60, max: 5 },
    },
  },

  /**
   * `account` is Better Auth's table of credentials and linked providers. This
   * app already has an Account - a wallet - so its own model is `AuthAccount`
   * and the mapping is declared here rather than renaming a domain noun.
   */
  account: { modelName: "authAccount" },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // No cookie cache. It would save one indexed lookup per request by trusting
    // a signed copy of the session for five minutes - and for those five minutes
    // a session that has been revoked would still work. That is exactly the
    // window a password reset is meant to close: someone holding a stolen
    // browser profile keeps both cookies, and "reset your password to lock them
    // out" has to mean now. Checked against the database on every request, a
    // revoked session is dead on the next one.
    cookieCache: { enabled: false },
  },

  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
