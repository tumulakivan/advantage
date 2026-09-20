import { Router } from "express";

import { listCatalog, readLogo } from "../queries/catalog";

/**
 * The catalog, as everybody else sees it: read-only.
 *
 * The logo route is deliberately unauthenticated. A brand mark is not anyone's
 * financial data, and requiring a session for it would mean every `<img>` tag
 * depending on a cross-origin cookie surviving whatever a browser decides about
 * third-party requests next year. Leaving it open makes it an ordinary image.
 */
export const catalogRouter: Router = Router();

catalogRouter.get("/catalog", async (_req, res) => {
  res.json(await listCatalog());
});

catalogRouter.get("/catalog/:slug/logo", async (req, res) => {
  const logo = await readLogo(req.params.slug);
  if (!logo) {
    res.status(404).json({ error: { code: "not_found", message: "No logo for that account." } });
    return;
  }

  // The URL carries a version, so this copy can never go stale: a replaced
  // logo is a different URL.
  res.setHeader("Content-Type", logo.type);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("ETag", `"${logo.version}"`);

  if (req.headers["if-none-match"] === `"${logo.version}"`) {
    res.status(304).end();
    return;
  }

  res.send(logo.bytes);
});
