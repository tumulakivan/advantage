import { Router } from "express";

import {
  addAccountFromCatalog,
  archiveAccount,
  createAccount,
  listAccounts,
  restoreAccount,
  updateAccount,
} from "../queries/accounts";
import {
  archiveCategory,
  createCategory,
  listCategories,
  listCategoryOptions,
  listCategoryTree,
  updateCategory,
} from "../queries/categories";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from "../queries/transactions";
import { ApiError } from "../errors";
import {
  accountInput,
  accountPatch,
  addFromCatalogInput,
  categoryInput,
  categoryPatch,
  transactionFilters,
  transactionInput,
  transactionPatch,
} from "../validation";
import { z } from "zod";

/**
 * Accounts, categories and transactions. The routes are deliberately thin: the
 * query functions are already typed and already scoped, so all that happens
 * here is parsing the request and handing over `req.tenant`.
 */
export const ledgerRouter: Router = Router();

const includeArchived = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

// ---- accounts ---------------------------------------------------------------

ledgerRouter.get("/accounts", async (req, res) => {
  const archived = includeArchived.parse(req.query.includeArchived ?? "false");
  res.json(await listAccounts(req.tenant, { includeArchived: archived }));
});

ledgerRouter.post("/accounts", async (req, res) => {
  const id = await createAccount(req.tenant, accountInput.parse(req.body));
  res.status(201).json({ id });
});

/** Add one of the catalog's accounts, logo and all, to this wallet. */
ledgerRouter.post("/accounts/from-catalog", async (req, res) => {
  const id = await addAccountFromCatalog(req.tenant, addFromCatalogInput.parse(req.body));
  res.status(201).json({ id });
});

ledgerRouter.patch("/accounts/:id", async (req, res) => {
  await updateAccount(req.tenant, req.params.id, accountPatch.parse(req.body));
  res.status(204).end();
});

ledgerRouter.post("/accounts/:id/archive", async (req, res) => {
  await archiveAccount(req.tenant, req.params.id);
  res.status(204).end();
});

ledgerRouter.post("/accounts/:id/restore", async (req, res) => {
  await restoreAccount(req.tenant, req.params.id);
  res.status(204).end();
});

// ---- categories -------------------------------------------------------------

const kind = z.enum(["expense", "income"]);

ledgerRouter.get("/categories", async (req, res) => {
  const parsed = z
    .object({ kind: kind.optional(), includeArchived: includeArchived })
    .parse({ kind: req.query.kind, includeArchived: req.query.includeArchived ?? "false" });

  res.json(await listCategories(req.tenant, parsed));
});

ledgerRouter.get("/categories/tree", async (req, res) => {
  const parsed = z.object({ kind: kind.optional() }).parse({ kind: req.query.kind });
  res.json(await listCategoryTree(req.tenant, parsed));
});

ledgerRouter.get("/categories/options", async (req, res) => {
  const parsed = z.object({ kind }).parse({ kind: req.query.kind });
  res.json(await listCategoryOptions(req.tenant, parsed.kind));
});

ledgerRouter.post("/categories", async (req, res) => {
  const id = await createCategory(req.tenant, categoryInput.parse(req.body));
  res.status(201).json({ id });
});

ledgerRouter.patch("/categories/:id", async (req, res) => {
  await updateCategory(req.tenant, req.params.id, categoryPatch.parse(req.body));
  res.status(204).end();
});

ledgerRouter.post("/categories/:id/archive", async (req, res) => {
  await archiveCategory(req.tenant, req.params.id);
  res.status(204).end();
});

// ---- transactions -----------------------------------------------------------

ledgerRouter.get("/transactions", async (req, res) => {
  res.json(await listTransactions(req.tenant, transactionFilters.parse(req.query)));
});

ledgerRouter.get("/transactions/:id", async (req, res) => {
  const row = await getTransaction(req.tenant, req.params.id);
  if (!row) throw ApiError.notFound("No such record.");
  res.json(row);
});

ledgerRouter.post("/transactions", async (req, res) => {
  const id = await createTransaction(req.tenant, transactionInput.parse(req.body));
  res.status(201).json({ id });
});

ledgerRouter.patch("/transactions/:id", async (req, res) => {
  await updateTransaction(req.tenant, req.params.id, transactionPatch.parse(req.body));
  res.status(204).end();
});

ledgerRouter.delete("/transactions/:id", async (req, res) => {
  await deleteTransaction(req.tenant, req.params.id);
  res.status(204).end();
});
