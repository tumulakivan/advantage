import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";

import { auth } from "./auth";
import { webOrigins } from "./env";
import { errorHandler, notFoundHandler } from "./errors";
import { requireAdmin } from "./middleware/admin";
import { requirePersonalAccount } from "./middleware/personal";
import { requireUser } from "./middleware/session";
import { accountRouter, meRouter } from "./routes/account";
import { adminRouter } from "./routes/admin";
import { catalogRouter } from "./routes/catalog";
import { ledgerRouter } from "./routes/ledger";
import { planningRouter } from "./routes/planning";
import { screensRouter } from "./routes/screens";

export function createApp(): Express {
  const app = express();

  // Behind a TLS terminator in production, so the session cookie's `secure`
  // flag and the client IP are read from the proxy headers.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    cors({
      origin: webOrigins,
      credentials: true,
    }),
  );

  /**
   * Better Auth reads the raw request body itself, so it has to be mounted
   * before the JSON parser gets to it. Everything below this line can assume
   * `req.body` is parsed; everything on this line must not.
   */
  app.all("/api/auth/*splat", toNodeHandler(auth));

  // A full backup is the whole ledger in one document. The default 100kb
  // would reject anyone with a couple of years of records.
  app.use(express.json({ limit: "50mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * The catalog is brand assets rather than anybody's money, so it is readable
   * without a session - which is what lets a logo be an ordinary `<img>` rather
   * than a request depending on a cross-origin cookie.
   */
  app.use("/api", catalogRouter);

  // From here down, every route has a user or does not run at all.

  // Who am I, and may I administer this? Open to every signed-in account,
  // because the browser has to ask before it knows which app to draw.
  app.use("/api", requireUser, meRouter);

  /**
   * Administration, under its own prefix and before the ledger.
   *
   * The prefix is load-bearing: `app.use(path, ...)` runs every middleware in
   * the chain for any request matching `path`, regardless of whether the
   * router behind it has a matching route. Mounted at `/api` these two chains
   * would each run their guard on the other's requests, and the first one
   * listed would win. `/api/admin` and `/api` do not overlap that way.
   *
   * The 404 at the end keeps an unknown `/api/admin/...` from falling through
   * into the ledger chain and coming back with the wrong complaint.
   */
  app.use("/api/admin", requireUser, requireAdmin, adminRouter, notFoundHandler);

  /**
   * The ledger. An admin account has none - it administers the service rather
   * than tracking anybody's money - so these refuse it, and the seed never
   * builds one for it in the first place.
   */
  app.use("/api", requireUser, requirePersonalAccount, ledgerRouter);
  app.use("/api", requireUser, requirePersonalAccount, planningRouter);
  app.use("/api", requireUser, requirePersonalAccount, screensRouter);
  app.use("/api", requireUser, requirePersonalAccount, accountRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
