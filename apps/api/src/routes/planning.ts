import { Router } from "express";
import { z } from "zod";

import { deleteBudget, listBudgetsForMonth, upsertBudget } from "../queries/budgets";
import {
  createPlanned,
  deletePlanned,
  listPlanned,
  listUpcoming,
  postPlanned,
  unpostPlanned,
  updatePlanned,
} from "../queries/planned";
import { budgetInput, monthKey, plannedInput, plannedPatch, postPlannedInput } from "../validation";

/** Budgets and the recurring schedule. */
export const planningRouter: Router = Router();

// ---- budgets ----------------------------------------------------------------

planningRouter.get("/budgets", async (req, res) => {
  const { month } = z.object({ month: monthKey }).parse(req.query);
  res.json(await listBudgetsForMonth(req.tenant, month));
});

planningRouter.put("/budgets", async (req, res) => {
  const id = await upsertBudget(req.tenant, budgetInput.parse(req.body));
  res.json({ id });
});

planningRouter.delete("/budgets/:id", async (req, res) => {
  await deleteBudget(req.tenant, req.params.id);
  res.status(204).end();
});

// ---- planned payments -------------------------------------------------------

const includeInactive = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

planningRouter.get("/planned", async (req, res) => {
  const inactive = includeInactive.parse(req.query.includeInactive ?? "false");
  res.json(await listPlanned(req.tenant, { includeInactive: inactive }));
});

planningRouter.get("/planned/upcoming", async (req, res) => {
  const { days } = z
    .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
    .parse(req.query);
  res.json(await listUpcoming(req.tenant, days));
});

planningRouter.post("/planned", async (req, res) => {
  const id = await createPlanned(req.tenant, plannedInput.parse(req.body));
  res.status(201).json({ id });
});

planningRouter.patch("/planned/:id", async (req, res) => {
  await updatePlanned(req.tenant, req.params.id, plannedPatch.parse(req.body));
  res.status(204).end();
});

planningRouter.delete("/planned/:id", async (req, res) => {
  await deletePlanned(req.tenant, req.params.id);
  res.status(204).end();
});

/** Turn a due occurrence into a real record. */
planningRouter.post("/planned/:id/post", async (req, res) => {
  const overrides = postPlannedInput.parse(req.body ?? {});
  const transactionId = await postPlanned(req.tenant, req.params.id, overrides);
  res.status(201).json({ id: transactionId });
});

/** Undo that, record and all. */
planningRouter.post("/planned/:id/unpost", async (req, res) => {
  await unpostPlanned(req.tenant, req.params.id);
  res.status(204).end();
});
