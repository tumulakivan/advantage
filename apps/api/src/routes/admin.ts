import { Router } from "express";
import { z } from "zod";

import {
  archiveCatalogEntry,
  createCatalogEntry,
  listCatalog,
  updateCatalogEntry,
} from "../queries/catalog";
import { loadMetrics } from "../queries/metrics";
import { catalogEntryInput, catalogEntryPatch } from "../validation";

/**
 * The admin surface: how the thing is being used, and the shared catalog.
 *
 * Mounted under `/api/admin`, which matters more than it looks. Express runs
 * every middleware on a `app.use(path, ...)` chain for any request matching
 * that path, whether or not the router behind it has a route - so mounting
 * these at `/api` alongside the ledger would mean each chain's guard firing on
 * the other's requests. Distinct prefixes keep each guard to its own routes.
 *
 * Note what is absent. There is no route here that reads a user's records, and
 * none that can. Administering this app means curating a list of account
 * logos and watching a usage graph - it does not mean being able to look at
 * somebody's spending, and the way to keep that true is to never build the
 * endpoint.
 */
export const adminRouter: Router = Router();

adminRouter.get("/metrics", async (_req, res) => {
  res.json(await loadMetrics());
});

adminRouter.get("/catalog", async (_req, res) => {
  res.json(await listCatalog({ includeArchived: true }));
});

adminRouter.post("/catalog", async (req, res) => {
  const entry = await createCatalogEntry(catalogEntryInput.parse(req.body));
  res.status(201).json(entry);
});

adminRouter.patch("/catalog/:id", async (req, res) => {
  res.json(await updateCatalogEntry(req.params.id, catalogEntryPatch.parse(req.body)));
});

adminRouter.post("/catalog/:id/archive", async (req, res) => {
  const { archived } = z.object({ archived: z.boolean().default(true) }).parse(req.body ?? {});
  res.json(await archiveCatalogEntry(req.params.id, archived));
});
