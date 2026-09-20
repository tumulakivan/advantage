import { Router } from "express";

import { loadDashboard, loadOutlook } from "../queries/screens";
import { loadWallet } from "../queries/wallet";
import { monthQuery, outlookQuery, walletQuery } from "../validation";

/**
 * One endpoint per heavy screen, rather than a seven-way `Promise.all` from the
 * browser. Each of these is a single round trip.
 */
export const screensRouter: Router = Router();

screensRouter.get("/dashboard", async (req, res) => {
  const { month, locale } = monthQuery.parse(req.query);
  res.json(await loadDashboard(req.tenant, month, locale));
});

screensRouter.get("/outlook", async (req, res) => {
  const { from, to, locale, granularity } = outlookQuery.parse(req.query);
  res.json(await loadOutlook(req.tenant, from, to, locale, granularity));
});

screensRouter.get("/wallet", async (req, res) => {
  const { month, includeArchived } = walletQuery.parse(req.query);
  res.json(await loadWallet(req.tenant, month, { includeArchived }));
});
