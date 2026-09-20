import {
  addMonths,
  buildBreakdown,
  buildCashflowSeries,
  buildOutlook,
  currentMonthKey,
  monthRange,
} from "@advantage/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { disconnect } from "../db/client";
import type { Tenant } from "../db/tenant";
import { createTestTenant, type TestTenant } from "../testing";
import { addAccountFromCatalog, listAccounts, updateAccount } from "./accounts";
import {
  incomeBySource,
  largestExpenses,
  monthTotals,
  monthlyTotals,
  netWorth,
  spendByGroup,
} from "./analytics";
import { exportBackup, importBackup, importPlan, importRecords } from "./backup";
import { listBudgetsForMonth, upsertBudget } from "./budgets";
import { listCategories, listCategoryOptions, listCategoryTree } from "./categories";
import { outlookEntries } from "./outlook";
import { createPlanned, listPlanned, listUpcoming, postPlanned, unpostPlanned } from "./planned";
import {
  createIncomeSource,
  databaseStats,
  listIncomeSources,
  readSettings,
  writeSettings,
} from "./settings";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "./transactions";
import { loadWallet } from "./wallet";

/**
 * Integration tests for the data layer: real Postgres, real migrations, real
 * Prisma.
 *
 * These are the same 36 assertions the SQLite build made, pointed at the new
 * database. They are the proof that the port did not change behaviour, and
 * they encode bugs that were real: the unqualified-column fault that silently
 * zeroed every balance, the outlook double-count guard, the group budget that
 * ignored its own subcategories.
 *
 * Two things are different. Every call takes a tenant rather than a database,
 * so there is a new section at the end for the question that could not be
 * asked before - whether one person can reach another's rows. And the dates
 * are derived from today rather than written down, because a suite that
 * starts failing next month teaches people to ignore it.
 */

let fixture: TestTenant;
let db: Tenant;

const MONTH = currentMonthKey();
const PREVIOUS = addMonths(MONTH, -1);
/** Far enough out that only the seeded schedule reaches it. */
const FUTURE = addMonths(MONTH, 9);

async function idOf(slug: string): Promise<string> {
  const rows = await listCategories(db, { includeArchived: true });
  const match = rows.find((row) => row.slug === slug);
  if (!match) throw new Error(`No seeded category ${slug}`);
  return match.id;
}

beforeAll(async () => {
  fixture = await createTestTenant("ledger");
  db = fixture.tenant;

  // A fresh ledger has only Cash, so the rest of the wallets this suite needs
  // are added the way a user would: from the shared catalog.
  await addAccountFromCatalog(db, { catalogSlug: "maribank" });
  await addAccountFromCatalog(db, { catalogSlug: "unionbank" });

  const accounts = await listAccounts(db);
  const cash = accounts.find((account) => account.slug === "cash")!;
  const bank = accounts.find((account) => account.slug === "maribank")!;

  const salary = (await listIncomeSources(db))[0]!;
  const rentalId = await createIncomeSource(db, { name: "Rental", shortName: "Rental" });
  const rental = (await listIncomeSources(db)).find((source) => source.id === rentalId)!;

  // One month of the real shape: two salaries in, bills and installments out.
  await createTransaction(db, {
    type: "income",
    amountMinor: 2_000_000,
    date: `${MONTH}-05`,
    accountId: bank.id,
    incomeSourceId: salary.id,
    categoryId: await idOf("income-salary"),
    payee: "Salary",
  });
  await createTransaction(db, {
    type: "income",
    amountMinor: 4_000_000,
    date: `${MONTH}-05`,
    accountId: bank.id,
    incomeSourceId: rental.id,
    categoryId: await idOf("income-rental"),
    payee: "Rental payout",
  });
  await createTransaction(db, {
    type: "expense",
    amountMinor: 150_000,
    date: `${MONTH}-08`,
    accountId: bank.id,
    categoryId: await idOf("bills-internet"),
    payee: "Internet bill",
  });
  await createTransaction(db, {
    type: "expense",
    amountMinor: 150_000,
    date: `${MONTH}-09`,
    accountId: bank.id,
    categoryId: await idOf("bills-electricity"),
    payee: "Electricity bill",
  });
  await createTransaction(db, {
    type: "expense",
    amountMinor: 250_000,
    date: `${MONTH}-12`,
    accountId: cash.id,
    categoryId: await idOf("loans-bnpl"),
    payee: "Installment",
  });
  await createTransaction(db, {
    type: "expense",
    amountMinor: 45_000,
    date: `${MONTH}-14`,
    accountId: cash.id,
    categoryId: await idOf("food-groceries"),
    payee: "Groceries",
  });
  // Previous month, so deltas have a baseline.
  await createTransaction(db, {
    type: "expense",
    amountMinor: 100_000,
    date: `${PREVIOUS}-10`,
    accountId: cash.id,
    categoryId: await idOf("food-groceries"),
  });
  // A transfer, which must not read as income or expense anywhere.
  await createTransaction(db, {
    type: "transfer",
    amountMinor: 1_000_000,
    date: `${MONTH}-15`,
    accountId: bank.id,
    toAccountId: accounts.find((account) => account.slug === "unionbank")!.id,
    note: "Move to savings",
  });
});

afterAll(async () => {
  await fixture?.dispose();
  await disconnect();
});

describe("migrations and seed", () => {
  // Its own account: the shared one has had wallets and sources added to it by
  // the fixture, which is exactly what a first-run assertion must not see.
  let fresh: TestTenant;

  beforeAll(async () => {
    fresh = await createTestTenant("first-run");
  });

  afterAll(async () => {
    await fresh?.dispose();
  });

  it("creates every table and seeds the taxonomy once", async () => {
    const stats = await databaseStats(fresh.tenant);
    // Cash, and nothing else: everyone has cash, nobody has every bank.
    expect(stats.accounts).toBe(1);
    expect(stats.categories).toBeGreaterThan(40);
    expect(stats.incomeSources).toBe(1);
    expect(stats.planned).toBe(3);
  });

  it("starts a new account with cash and nothing else", async () => {
    const accounts = await listAccounts(fresh.tenant);
    expect(accounts.map((account) => account.slug)).toEqual(["cash"]);
    expect(accounts[0]?.balanceMinor).toBe(0);
  });

  it("seeds exactly seven expense groups, one per chart slot", async () => {
    const tree = await listCategoryTree(db, { kind: "expense" });
    expect(tree).toHaveLength(7);
    const colors = tree.map((node) => node.color);
    expect(new Set(colors).size).toBe(7);
    expect(colors.every((color) => color?.startsWith("chart-"))).toBe(true);
  });

  it("nests subcategories under their group", async () => {
    const options = await listCategoryOptions(db, "expense");
    const groceries = options.find((option) => option.name === "Groceries");
    expect(groceries?.depth).toBe(1);
    expect(groceries?.parentName).toBe("Food & Dining");
    // A child with no hue of its own inherits the group's.
    expect(groceries?.color).toBe("chart-3");
  });

  it("seeds one generic income source, as an example to rename", async () => {
    const sources = await listIncomeSources(fresh.tenant);
    expect(sources.map((source) => source.name)).toEqual(["Salary"]);
    // Text only. Whose payroll it is is the user's business, not a brand we host.
    expect(sources.every((source) => source.logo === null)).toBe(true);
    expect(sources[0]?.color).toBe("chart-1");
  });
});

describe("transactions", () => {
  it("lists with joined labels and inherited category color", async () => {
    const rows = await listTransactions(db, { dateFrom: `${MONTH}-01` });
    const installment = rows.find((row) => row.payee === "Installment");
    expect(installment?.categoryName).toBe("Buy Now Pay Later");
    expect(installment?.parentCategoryName).toBe("Loans & Installments");
    expect(installment?.categoryColor).toBe("chart-2");
    expect(installment?.accountName).toBe("Cash");
  });

  it("attaches the income source to income rows", async () => {
    const rows = await listTransactions(db, { types: ["income"] });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sourceShortName).sort()).toEqual(["Rental", "Salary"]);
  });

  it("filters a group by its children", async () => {
    const billsId = await idOf("bills");
    const rows = await listTransactions(db, { categoryId: billsId });
    expect(rows.map((row) => row.payee).sort()).toEqual(["Electricity bill", "Internet bill"]);
  });

  it("searches payee and note case-insensitively", async () => {
    const rows = await listTransactions(db, { search: "install" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payee).toBe("Installment");
  });

  it("combines a search with an account filter rather than widening it", async () => {
    const accounts = await listAccounts(db);
    const cash = accounts.find((account) => account.slug === "cash")!;
    const bank = accounts.find((account) => account.slug === "maribank")!;

    // "Installment" is on Cash. Asking for it on Maribank must find nothing,
    // not fall back to every Maribank row.
    expect(await listTransactions(db, { search: "install", accountId: cash.id })).toHaveLength(1);
    expect(await listTransactions(db, { search: "install", accountId: bank.id })).toHaveLength(0);
  });

  it("stores a magnitude even when handed a negative amount", async () => {
    const accounts = await listAccounts(db);
    const id = await createTransaction(db, {
      type: "expense",
      amountMinor: -12_345,
      date: `${MONTH}-20`,
      accountId: accounts[0]!.id,
      payee: "Sign check",
    });
    const rows = await listTransactions(db, { search: "sign check" });
    expect(rows[0]?.amountMinor).toBe(12_345);

    await updateTransaction(db, id, { amountMinor: -500 });
    const updated = await listTransactions(db, { search: "sign check" });
    expect(updated[0]?.amountMinor).toBe(500);

    await deleteTransaction(db, id);
    expect(await listTransactions(db, { search: "sign check" })).toHaveLength(0);
  });
});

describe("balances", () => {
  it("derives account balances including both sides of a transfer", async () => {
    const accounts = await listAccounts(db);
    const bank = accounts.find((account) => account.slug === "maribank")!;
    const unionbank = accounts.find((account) => account.slug === "unionbank")!;
    const cash = accounts.find((account) => account.slug === "cash")!;

    // in 20,000 + 40,000, out 1,500 + 1,500, 10,000 transferred away
    expect(bank.balanceMinor).toBe(2_000_000 + 4_000_000 - 150_000 - 150_000 - 1_000_000);
    expect(unionbank.balanceMinor).toBe(1_000_000);
    expect(cash.balanceMinor).toBe(-250_000 - 45_000 - 100_000);
  });

  it("nets to the same total across accounts", async () => {
    const accounts = await listAccounts(db);
    const sum = accounts.reduce((total, account) => total + account.balanceMinor, 0);
    expect(await netWorth(db)).toBe(sum);
  });
});

describe("analytics", () => {
  it("excludes transfers from income and expense totals", async () => {
    const totals = await monthTotals(db, MONTH);
    expect(totals.incomeMinor).toBe(6_000_000);
    expect(totals.expenseMinor).toBe(150_000 + 150_000 + 250_000 + 45_000);
  });

  it("groups spending into the seven top-level groups", async () => {
    const rows = await spendByGroup(db, MONTH);
    const bills = rows.find((row) => row.label === "Bills & Utilities");
    expect(bills?.amountMinor).toBe(300_000);
    expect(bills?.color).toBe("chart-1");
    expect(rows.every((row) => row.color.startsWith("chart-"))).toBe(true);

    const breakdown = buildBreakdown(rows);
    expect(breakdown.totalMinor).toBe(595_000);
    expect(breakdown.slices.some((slice) => slice.isOther)).toBe(false);
  });

  it("builds a gapless monthly series", async () => {
    const months = monthRange(MONTH, 6);
    const rows = await monthlyTotals(db, months[0]!, MONTH);
    const series = buildCashflowSeries(rows, months);
    expect(series).toHaveLength(6);
    expect(series.at(-1)?.netMinor).toBe(6_000_000 - 595_000);
    expect(series.at(0)?.incomeMinor).toBe(0);
  });

  it("splits income by source", async () => {
    const rows = await incomeBySource(db, MONTH);
    expect(rows[0]?.shortName).toBe("Rental");
    expect(rows[0]?.amountMinor).toBe(4_000_000);
    expect(rows[1]?.amountMinor).toBe(2_000_000);
  });

  it("ranks the largest expenses", async () => {
    const rows = await largestExpenses(db, MONTH, 3);
    expect(rows.map((row) => row.payee)).toEqual([
      "Installment",
      "Internet bill",
      "Electricity bill",
    ]);
  });
});

describe("budgets", () => {
  it("counts subcategory spending against a group budget", async () => {
    const foodId = await idOf("food");
    await upsertBudget(db, { categoryId: foodId, amountMinor: 100_000, startMonth: MONTH });

    // A fixed "today" at month end, so the pace verdict does not depend on
    // which day the suite happens to run.
    const monthEndDay = new Date(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)), 0);
    const rows = await listBudgetsForMonth(db, MONTH, monthEndDay);
    const food = rows.find((row) => row.categoryId === foodId);
    expect(food?.spentMinor).toBe(45_000);
    expect(food?.verdict.state).toBe("ok");
    expect(food?.verdict.remainingMinor).toBe(55_000);
  });

  it("updates in place rather than stacking duplicates", async () => {
    const foodId = await idOf("food");
    await upsertBudget(db, { categoryId: foodId, amountMinor: 40_000, startMonth: MONTH });

    const monthEndDay = new Date(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)), 0);
    const rows = await listBudgetsForMonth(db, MONTH, monthEndDay);
    expect(rows.filter((row) => row.categoryId === foodId)).toHaveLength(1);
    expect(rows.find((row) => row.categoryId === foodId)?.verdict.state).toBe("over");
  });

  it("measures an overall budget against everything spent", async () => {
    await upsertBudget(db, { categoryId: null, amountMinor: 1_000_000, startMonth: MONTH });
    const rows = await listBudgetsForMonth(db, MONTH);
    const overall = rows.find((row) => row.categoryId === null);
    expect(overall?.spentMinor).toBe(595_000);
    expect(overall?.categoryName).toBeNull();
  });
});

describe("planned payments", () => {
  it("projects the next due date for the seeded bills", async () => {
    const rows = await listPlanned(db, { from: `${MONTH}-10` });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.nextDueDate !== null)).toBe(true);
    const internet = rows.find((row) => row.name.startsWith("Internet"));
    // Seeded on the 1st, so from the 10th the next one is next month's.
    expect(internet?.nextDueDate).toBe(`${addMonths(MONTH, 1)}-01`);
    expect(internet?.categoryName).toBe("Internet");
  });

  it("lists only what falls inside the horizon", async () => {
    const rows = await listUpcoming(db, 0);
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  it("posts an occurrence as a real record and marks it paid", async () => {
    const planned = await listPlanned(db, { from: `${MONTH}-10` });
    const electricity = planned.find((row) => row.name.startsWith("Electricity"))!;

    const transactionId = await postPlanned(db, electricity.id, {
      date: `${MONTH}-25`,
      amountMinor: 187_500,
    });
    expect(transactionId).toBeTruthy();

    const rows = await listTransactions(db, { search: "Electricity" });
    const posted = rows.find((row) => row.date === `${MONTH}-25`);
    expect(posted?.amountMinor).toBe(187_500);
    expect(posted?.plannedPaymentId).toBe(electricity.id);

    const after = await listPlanned(db, { from: `${MONTH}-10` });
    expect(after.find((row) => row.id === electricity.id)?.lastPostedDate).toBe(`${MONTH}-25`);
  });
});

describe("planned payments, undone", () => {
  it("undoing a post removes the record it created", async () => {
    const planned = await listPlanned(db, { from: `${MONTH}-10` });
    const internet = planned.find((row) => row.name.startsWith("Internet"))!;

    await postPlanned(db, internet.id, { date: `${MONTH}-26` });
    expect(
      (await listTransactions(db, { search: "internet" })).some(
        (row) => row.date === `${MONTH}-26`,
      ),
    ).toBe(true);

    await unpostPlanned(db, internet.id);

    const after = await listPlanned(db, { from: `${MONTH}-10` });
    const row = after.find((entry) => entry.id === internet.id);
    expect(row?.lastPostedDate).toBeNull();
    expect(row?.postedForCurrent).toBe(false);
    expect(
      (await listTransactions(db, { search: "internet" })).some(
        (entry) => entry.date === `${MONTH}-26`,
      ),
    ).toBe(false);
  });
});

describe("wallet", () => {
  it("seeds the real accounts with their counted balances", async () => {
    const wallet = await loadWallet(db, MONTH);
    expect(wallet.accounts.map((account) => account.slug)).toEqual([
      "cash",
      "maribank",
      "unionbank",
    ]);
    // Added from the catalog, so they carry its artwork.
    const maribank = wallet.accounts.find((account) => account.slug === "maribank");
    expect(maribank?.logoUrl).toMatch(/^\/api\/catalog\/maribank\/logo/);
    expect(wallet.accounts.find((account) => account.slug === "cash")?.logoUrl).toBeNull();
    // A fresh ledger opens every wallet at zero; balances arrive by import.
    const opening = wallet.accounts.reduce(
      (sum, account) => sum + account.openingBalanceMinor,
      0,
    );
    expect(opening).toBe(0);
  });

  it("keeps the all-time balance apart from the month's movement", async () => {
    const wallet = await loadWallet(db, MONTH);
    const cash = wallet.accounts.find((account) => account.slug === "cash")!;

    // The installment and the groceries, plus the electricity the planned-payment
    // test posted - the seeded schedule draws on Cash now that it is the only
    // wallet a new account has.
    expect(cash.spentMinor).toBe(250_000 + 45_000 + 187_500);
    expect(cash.receivedMinor).toBe(0);
    // The balance also counts the previous month, which the month figures must not.
    expect(cash.balanceMinor).toBe(-250_000 - 45_000 - 187_500 - 100_000);
  });

  it("counts both halves of a transfer against the right accounts", async () => {
    const wallet = await loadWallet(db, MONTH);
    const bank = wallet.accounts.find((account) => account.slug === "maribank")!;
    const union = wallet.accounts.find((account) => account.slug === "unionbank")!;

    expect(bank.transferredOutMinor).toBe(1_000_000);
    expect(union.transferredInMinor).toBe(1_000_000);

    // A transfer is neither spending nor income on either side.
    const onBank = await listTransactions(db, {
      accountId: bank.id,
      dateFrom: `${MONTH}-01`,
      dateTo: `${MONTH}-31`,
      limit: 999,
    });
    const expensesOnBank = onBank
      .filter((row) => row.type === "expense")
      .reduce((sum, row) => sum + row.amountMinor, 0);
    expect(bank.spentMinor).toBe(expensesOnBank);
    expect(bank.spentMinor).toBeGreaterThan(0);

    expect(union.spentMinor).toBe(0);
    expect(union.receivedMinor).toBe(0);
  });

  it("totals only the accounts that count toward net worth", async () => {
    const before = await loadWallet(db, MONTH);
    const union = before.accounts.find((account) => account.slug === "unionbank")!;

    await updateAccount(db, union.id, { excludeFromTotals: true });
    const after = await loadWallet(db, MONTH);

    expect(after.totals.accountCount).toBe(before.totals.accountCount - 1);
    expect(after.totals.balanceMinor).toBe(before.totals.balanceMinor - union.balanceMinor);

    await updateAccount(db, union.id, { excludeFromTotals: false });
  });
});

describe("outlook", () => {
  it("combines logged records with the occurrences still to come", async () => {
    const entries = await outlookEntries(db, `${MONTH}-01`, `${MONTH}-28`);

    expect(entries.filter((entry) => entry.kind === "logged").length).toBeGreaterThan(0);
    expect(entries.filter((entry) => entry.kind === "planned").length).toBeGreaterThan(0);

    // Sorted by date, then income before spending on the same day.
    const dates = entries.map((entry) => entry.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("leaves transfers out of both sides", async () => {
    const entries = await outlookEntries(db, `${MONTH}-01`, `${MONTH}-28`);
    expect(entries.some((entry) => entry.label === "Move to savings")).toBe(false);
    expect(entries.every((entry) => entry.direction !== ("transfer" as never))).toBe(true);
  });

  it("does not count an occurrence that has already been posted", async () => {
    const before = await outlookEntries(db, `${FUTURE}-01`, `${FUTURE}-28`);
    const internetRows = before.filter((entry) => entry.label.startsWith("Internet"));
    expect(internetRows).toHaveLength(1);
    expect(internetRows[0]?.kind).toBe("planned");

    // Post that occurrence: it becomes a record, so the projection drops it.
    const schedules = await listPlanned(db, { from: `${FUTURE}-01` });
    const schedule = schedules.find((row) => row.name.startsWith("Internet"))!;
    await postPlanned(db, schedule.id, { date: `${FUTURE}-01` });

    const after = await outlookEntries(db, `${FUTURE}-01`, `${FUTURE}-28`);
    const occurrences = after.filter((entry) => entry.label.startsWith("Internet"));
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.kind).toBe("logged");

    await unpostPlanned(db, schedule.id);
  });

  it("expands a weekly schedule across the window", async () => {
    const accounts = await listAccounts(db);
    const window = addMonths(MONTH, 10);

    await createPlanned(db, {
      name: "Weekly payout",
      type: "income",
      amountMinor: 1_000_000,
      frequency: "weekly",
      anchorDate: `${window}-06`,
      accountId: accounts[0]!.id,
      active: true,
    });

    const entries = await outlookEntries(db, `${window}-01`, `${window}-28`);
    const weekly = entries.filter((entry) => entry.label === "Weekly payout");
    expect(weekly.map((entry) => entry.date)).toEqual([
      `${window}-06`,
      `${window}-13`,
      `${window}-20`,
      `${window}-27`,
    ]);
    expect(weekly.every((entry) => entry.kind === "planned")).toBe(true);
  });

  it("feeds an outlook whose totals reconcile with its buckets", async () => {
    const from = `${addMonths(MONTH, 9)}-01`;
    const to = `${addMonths(MONTH, 11)}-28`;
    const entries = await outlookEntries(db, from, to);
    const outlook = buildOutlook(entries, from, to, { today: `${MONTH}-19` });

    const bucketNet = outlook.buckets.reduce((sum, bucket) => sum + bucket.netMinor, 0);
    expect(bucketNet).toBe(outlook.totals.netMinor);
    expect(outlook.totals.loggedNetMinor + outlook.totals.plannedNetMinor).toBe(
      outlook.totals.netMinor,
    );
    // Today is months before the window, so there is no marker to draw.
    expect(outlook.todayBucket).toBeNull();
  });
});

describe("settings and portability", () => {
  it("round-trips settings", async () => {
    expect((await readSettings(db)).currency).toBe("PHP");
    await writeSettings(db, { currency: "AUD", theme: "light" });
    const settings = await readSettings(db);
    expect(settings.currency).toBe("AUD");
    expect(settings.theme).toBe("light");
    await writeSettings(db, { currency: "PHP", theme: "dark" });
  });

  it("exports every table", async () => {
    const backup = await exportBackup(db);
    expect(backup.format).toBe("advantage-backup");
    expect(backup.tables.transactions.length).toBeGreaterThan(5);
    expect(backup.tables.categories.length).toBeGreaterThan(40);
    // Whose rows they are is not part of the file.
    expect(backup.tables.accounts.every((row) => !("userId" in row))).toBe(true);
  });

  it("restores its own export without changing anything", async () => {
    const before = await exportBackup(db);
    const balancesBefore = (await listAccounts(db)).map((row) => row.balanceMinor);

    await importBackup(db, before);

    const after = await exportBackup(db);
    expect(after.tables.transactions).toHaveLength(before.tables.transactions.length);
    expect((await listAccounts(db)).map((row) => row.balanceMinor)).toEqual(balancesBefore);
  });

  it("imports a dated plan into Planned, never into the ledger", async () => {
    const balancesBefore = (await listAccounts(db)).map((row) => row.balanceMinor);
    const ledgerBefore = (await listTransactions(db, { limit: 999 })).length;
    // Counted rather than hard-coded: earlier tests in this file add schedules.
    const scheduledBefore = (await listPlanned(db, { includeInactive: true })).length;

    const ends = addMonths(MONTH, 5);
    const summary = await importPlan(db, {
      format: "advantage-plan",
      version: 1,
      replaceExisting: true,
      planned: [
        {
          name: "Rental weekly pay",
          type: "income",
          amount: 10000,
          date: `${MONTH}-22`,
          frequency: "weekly",
          category: "income-rental",
          account: "maribank",
          source: "Rental",
        },
        {
          name: "Family support",
          type: "expense",
          amount: 10000,
          date: `${addMonths(MONTH, 3)}-20`,
          frequency: "monthly",
          endDate: `${ends}-28`,
          category: "home-support",
          account: "maribank",
        },
        {
          name: "Installment",
          type: "expense",
          amount: 2500,
          date: `${addMonths(MONTH, 1)}-17`,
          frequency: "once",
          category: "loans-cash",
          account: "maribank",
        },
        { name: "Broken row", type: "expense", amount: Number.NaN, date: "", frequency: "once" },
      ],
    });

    expect(summary.created).toBe(3);
    expect(summary.skipped).toBe(1);
    expect(summary.removed).toBe(scheduledBefore);

    // The whole point: a plan moves no money.
    expect((await listAccounts(db)).map((row) => row.balanceMinor)).toEqual(balancesBefore);
    expect((await listTransactions(db, { limit: 999 })).length).toBe(ledgerBefore);

    const rows = await listPlanned(db, { from: `${MONTH}-19` });
    expect(rows).toHaveLength(3);

    const weekly = rows.find((row) => row.name === "Rental weekly pay");
    expect(weekly?.frequency).toBe("weekly");
    expect(weekly?.nextDueDate).toBe(`${MONTH}-22`);
    expect(weekly?.sourceName).toBe("Rental");

    const oneOff = rows.find((row) => row.name === "Installment");
    expect(oneOff?.amountMinor).toBe(250_000);
    expect(oneOff?.categoryName).toBe("Cash Loan");

    // A series stops producing dates once it is past its end...
    const afterEnd = await listPlanned(db, { from: `${addMonths(MONTH, 6)}-01` });
    expect(afterEnd.find((row) => row.name === "Family support")?.nextDueDate).toBeNull();
    // ...and a one-off that has already fired stops offering a date too.
    expect(afterEnd.find((row) => row.name === "Installment")?.nextDueDate).toBeNull();
  });

  it("rejects a file that is not a plan", async () => {
    await expect(importPlan(db, { format: "something-else" })).rejects.toThrow(
      /not an advantage plan file/i,
    );
  });

  it("imports plain records by slug and name", async () => {
    const summary = await importRecords(db, {
      format: "advantage-records",
      version: 1,
      records: [
        {
          type: "expense",
          amount: 1500,
          date: `${PREVIOUS}-20`,
          category: "loans-bnpl",
          account: "Maribank",
          payee: "Lender",
        },
        {
          type: "income",
          amount: 25000,
          date: `${PREVIOUS}-05`,
          category: "Salary",
          source: "Salary",
          account: "maribank",
        },
        { type: "expense", amount: 500, date: `${PREVIOUS}-21`, category: "Nope" },
      ],
    });

    expect(summary.inserted).toBe(3);
    expect(summary.unresolvedCategories).toEqual(["Nope"]);

    const rows = await listTransactions(db, { search: "lender" });
    expect(rows[0]?.amountMinor).toBe(150_000);
    expect(rows[0]?.accountName).toBe("Maribank");
  });
});

/**
 * The section that could not exist before. On a single-user database in a
 * single browser, "can someone else read this" had no meaning; now it is the
 * question that matters most, because a missing WHERE clause leaks someone's
 * salary and debts.
 */
describe("tenant isolation", () => {
  let other: TestTenant;

  beforeAll(async () => {
    other = await createTestTenant("intruder");
  });

  afterAll(async () => {
    await other?.dispose();
  });

  it("gives a new account its own seeded ledger, sharing no rows", async () => {
    const mine = await listAccounts(db);
    const theirs = await listAccounts(other.tenant);

    expect(theirs).toHaveLength(1);
    expect(theirs.some((row) => mine.some((entry) => entry.id === row.id))).toBe(false);
  });

  it("shows none of another account's records or figures", async () => {
    expect(await listTransactions(other.tenant, { limit: 999 })).toHaveLength(0);
    expect((await monthTotals(other.tenant, MONTH)).incomeMinor).toBe(0);
    expect(await netWorth(other.tenant)).toBe(0);
    expect((await exportBackup(other.tenant)).tables.transactions).toHaveLength(0);
  });

  it("cannot read one by id", async () => {
    const mine = (await listTransactions(db, { limit: 1 }))[0]!;
    const theirs = await listTransactions(other.tenant, { limit: 999 });
    expect(theirs.some((row) => row.id === mine.id)).toBe(false);
  });

  it("cannot update or delete one by id", async () => {
    const mine = (await listTransactions(db, { search: "salary" }))[0]!;
    const before = mine.amountMinor;

    await updateTransaction(other.tenant, mine.id, { amountMinor: 1 });
    await deleteTransaction(other.tenant, mine.id);

    const after = (await listTransactions(db, { search: "salary" }))[0];
    expect(after?.id).toBe(mine.id);
    expect(after?.amountMinor).toBe(before);
  });

  it("cannot wipe another ledger by restoring an empty backup", async () => {
    const before = await databaseStats(db);

    await importBackup(other.tenant, {
      format: "advantage-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: {
        accounts: [],
        categories: [],
        incomeSources: [],
        transactions: [],
        budgets: [],
        plannedPayments: [],
        settings: [],
      },
    });

    expect(await databaseStats(db)).toEqual(before);
    // It did clear their own, which is what a restore is supposed to do.
    expect((await databaseStats(other.tenant)).accounts).toBe(0);
  });
});
