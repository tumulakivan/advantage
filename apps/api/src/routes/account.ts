import { Router } from "express";

import { prisma } from "../db/client";
import {
  exportBackup,
  importBackup,
  importPlan,
  importRecords,
  resetLedger,
} from "../queries/backup";
import {
  archiveIncomeSource,
  createIncomeSource,
  databaseStats,
  listIncomeSources,
  readSettings,
  restoreIncomeSource,
  updateIncomeSource,
  writeSettings,
} from "../queries/settings";
import { forgetSeeded } from "../seed";
import { incomeSourceInput, incomeSourcePatch, settingsPatch } from "../validation";
import { z } from "zod";

/**
 * Settings and the data tools.
 *
 * The export route matters more than it looks. The local-first app could say
 * honestly that records never left the browser; a server ends that, and the
 * thing that softens it is being able to take everything out again whenever
 * you like. It stays a first-class route for that reason.
 */
export const accountRouter: Router = Router();

// ---- settings ---------------------------------------------------------------

accountRouter.get("/settings", async (req, res) => {
  res.json(await readSettings(req.tenant));
});

accountRouter.patch("/settings", async (req, res) => {
  await writeSettings(req.tenant, settingsPatch.parse(req.body));
  res.json(await readSettings(req.tenant));
});

accountRouter.get("/income-sources", async (req, res) => {
  const includeArchived = z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
    .parse(req.query.includeArchived ?? "false");

  res.json(await listIncomeSources(req.tenant, { includeArchived }));
});

accountRouter.post("/income-sources", async (req, res) => {
  const id = await createIncomeSource(req.tenant, incomeSourceInput.parse(req.body));
  res.status(201).json({ id });
});

accountRouter.patch("/income-sources/:id", async (req, res) => {
  await updateIncomeSource(req.tenant, req.params.id, incomeSourcePatch.parse(req.body));
  res.status(204).end();
});

accountRouter.post("/income-sources/:id/archive", async (req, res) => {
  await archiveIncomeSource(req.tenant, req.params.id);
  res.status(204).end();
});

accountRouter.post("/income-sources/:id/restore", async (req, res) => {
  await restoreIncomeSource(req.tenant, req.params.id);
  res.status(204).end();
});

accountRouter.get("/stats", async (req, res) => {
  res.json(await databaseStats(req.tenant));
});

// ---- data in and out ---------------------------------------------------------

accountRouter.get("/backup", async (req, res) => {
  res.json(await exportBackup(req.tenant));
});

accountRouter.post("/import/backup", async (req, res) => {
  await importBackup(req.tenant, req.body);
  res.json({ ok: true });
});

accountRouter.post("/import/records", async (req, res) => {
  res.json(await importRecords(req.tenant, req.body));
});

accountRouter.post("/import/plan", async (req, res) => {
  res.json(await importPlan(req.tenant, req.body));
});

/** Erase the ledger. The next request seeds a fresh one. */
accountRouter.post("/reset", async (req, res) => {
  await resetLedger(req.tenant);
  forgetSeeded(req.tenant.userId);
  res.json({ ok: true });
});


/**
 * Who the caller is, and whether the service treats them as an admin.
 *
 * The one route here that an admin account can reach, because the browser has
 * to ask it that question before it knows which app to draw.
 */
export const meRouter: Router = Router();

meRouter.get("/me", (req, res) => {
  res.json(req.user);
});

/**
 * Delete the account itself. Everything cascades from the user row, which is
 * what makes "delete my account" mean it rather than leaving orphaned
 * financial records in a table nobody looks at.
 */
meRouter.delete("/me", async (req, res) => {
  const userId = req.tenant.userId;
  await prisma.user.delete({ where: { id: userId } });
  forgetSeeded(userId);
  res.clearCookie("better-auth.session_token", { path: "/" });
  res.json({ ok: true });
});
