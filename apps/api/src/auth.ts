import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./db/client";
import { env, isProduction, webOrigins } from "./env";

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
    // Anyone can sign up; there is no invite gate. Email verification is off
    // until a transactional sender is wired, because a verification mail that
    // never arrives locks people out of their own records.
    requireEmailVerification: false,
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
    // Sign the session into a short-lived cookie so the common case - "is this
    // request logged in?" - does not hit the database on every call.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
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
