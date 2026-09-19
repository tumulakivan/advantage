import { buildBreakdown, buildCashflowSeries, buildOutlook, monthRange } from "@advantage/core";
import { beforeAll, describe, expect, it } from "vitest";

import { migrations } from "./migrator";
import { accounts as accountsTable } from "./schema";
import { createTestConnection, type TestConnection } from "./testing";

import { listAccounts, updateAccount } from "./queries/accounts";
import { incomeBySource, largestExpenses, monthTotals, monthlyTotals, netWorth, spendByGroup } from "./queries/analytics";
import { exportBackup, importPlan, importRecords } from "./queries/backup";
import { listBudgetsForMonth, upsertBudget } from "./queries/budgets";
import { listCategories, listCategoryOptions, listCategoryTree } from "./queries/categories";
import { outlookEntries } from "./queries/outlook";
import { loadWallet } from "./queries/wallet";
import {
  createPlanned,
  listPlanned,
  listUpcoming,
  postPlanned,
  unpostPlanned,
} from "./queries/planned";
import { databaseStats, listIncomeSources, readSettings, writeSettings } from "./queries/settings";
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from "./queries/transactions";

/**
 * Integration tests for the data layer: real SQLite, real migrations, real
 * Drizzle. They exist because the app has no server to catch a bad join.
 */

let connection: TestConnection;
const MONTH = "2026-09";
const PREVIOUS = "2026-08";

async function idOf(slug: string): Promise<string> {
  const rows = await listCategories(connection.db, { includeArchived: true });
  const match = rows.find((row) => row.slug === slug);
  if (!match) throw new Error(`No seeded category ${slug}`);
  return match.id;
}

beforeAll(async () => {
  connection = await createTestConnection();

  const accounts = await listAccounts(connection.db);
  const cash = accounts.find((account) => account.slug === "cash")!;
  const bank = accounts.find((account) => account.slug === "maribank")!;
  const sources = await listIncomeSources(connection.db);
  const mentis = sources.find((source) => source.slug === "mentis")!;
  const liveLuxe = sources.find((source) => source.slug === "live-luxe")!;

  // One month of the real shape: two salaries in, bills and installments out.
  await createTransaction(connection.db, {
    type: "income",
    amountMinor: 2_000_000,
    date: `${MONTH}-05`,
    accountId: bank.id,
    incomeSourceId: mentis.id,
    categoryId: await idOf("income-salary"),
    payee: "Salary",
  });
  await createTransaction(connection.db, {
    type: "income",
    amountMinor: 4_000_000,
    date: `${MONTH}-05`,
    accountId: bank.id,
    incomeSourceId: liveLuxe.id,
    categoryId: await idOf("income-rental"),
    payee: "Rental payout",
  });
  await createTransaction(connection.db, {
    type: "expense",
    amountMinor: 150_000,
    date: `${MONTH}-08`,
    accountId: bank.id,
    categoryId: await idOf("bills-internet"),
    payee: "Internet bill",
  });
  await createTransaction(connection.db, {
    type: "expense",
    amountMinor: 150_000,
    date: `${MONTH}-09`,
    accountId: bank.id,
    categoryId: await idOf("bills-electricity"),
    payee: "Electricity bill",
  });
  await createTransaction(connection.db, {
    type: "expense",
    amountMinor: 250_000,
    date: `${MONTH}-12`,
    accountId: cash.id,
    categoryId: await idOf("loans-bnpl"),
    payee: "Installment",
  });
  await createTransaction(connection.db, {
    type: "expense",
    amountMinor: 45_000,
    date: `${MONTH}-14`,
    accountId: cash.id,
    categoryId: await idOf("food-groceries"),
    payee: "Groceries",
  });
  // Previous month, so deltas have a baseline.
  await createTransaction(connection.db, {
    type: "expense",
    amountMinor: 100_000,
    date: `${PREVIOUS}-10`,
    accountId: cash.id,
    categoryId: await idOf("food-groceries"),
  });
  // A transfer, which must not read as income or expense anywhere.
  await createTransaction(connection.db, {
    type: "transfer",
    amountMinor: 1_000_000,
    date: `${MONTH}-15`,
    accountId: bank.id,
    toAccountId: accounts.find((account) => account.slug === "unionbank")!.id,
    note: "Move to savings",
  });
});

describe("migrations and seed", () => {
  it("creates every table and seeds the taxonomy once", async () => {
    const stats = await databaseStats(connection.db);
    expect(stats.accounts).toBe(5);
    expect(stats.categories).toBeGreaterThan(40);
    expect(stats.incomeSources).toBe(2);
    expect(stats.planned).toBe(4);
  });

  it("seeds exactly seven expense groups, one per chart slot", async () => {
    const tree = await listCategoryTree(connection.db, { kind: "expense" });
    expect(tree).toHaveLength(7);
    const colors = tree.map((node) => node.color);
    expect(new Set(colors).size).toBe(7);
    expect(colors.every((color) => color?.startsWith("chart-"))).toBe(true);
  });

  it("nests subcategories under their group", async () => {
    const options = await listCategoryOptions(connection.db, "expense");
    const groceries = options.find((option) => option.name === "Groceries");
    expect(groceries?.depth).toBe(1);
    expect(groceries?.parentName).toBe("Food & Dining");
    // A child with no hue of its own inherits the group's.
    expect(groceries?.color).toBe("chart-3");
  });

  it("offers the two income sources with their logos", async () => {
    const sources = await listIncomeSources(connection.db);
    expect(sources.map((source) => source.name)).toEqual([
      "Mentis Global",
      "Live Luxe Rentals AU",
    ]);
    expect(sources.map((source) => source.logo)).toEqual(["mentis", "live-luxe"]);
  });
});

describe("transactions", () => {
  it("lists with joined labels and inherited category color", async () => {
    const rows = await listTransactions(connection.db, { dateFrom: `${MONTH}-01` });
    const installment = rows.find((row) => row.payee === "Installment");
    expect(installment?.categoryName).toBe("Buy Now Pay Later");
    expect(installment?.parentCategoryName).toBe("Loans & Installments");
    expect(installment?.categoryColor).toBe("chart-2");
    expect(installment?.accountName).toBe("Cash");
  });

  it("attaches the income source to income rows", async () => {
    const rows = await listTransactions(connection.db, { types: ["income"] });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sourceShortName).sort()).toEqual(["Live Luxe", "Mentis"]);
  });

  it("filters a group by its children", async () => {
    const billsId = await idOf("bills");
    const rows = await listTransactions(connection.db, { categoryId: billsId });
    expect(rows.map((row) => row.payee).sort()).toEqual(["Electricity bill", "Internet bill"]);
  });

  it("searches payee and note case-insensitively", async () => {
    const rows = await listTransactions(connection.db, { search: "install" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payee).toBe("Installment");
  });

  it("stores a magnitude even when handed a negative amount", async () => {
    const accounts = await listAccounts(connection.db);
    const id = await createTransaction(connection.db, {
      type: "expense",
      amountMinor: -12_345,
      date: `${MONTH}-20`,
      accountId: accounts[0]!.id,
      payee: "Sign check",
    });
    const rows = await listTransactions(connection.db, { search: "sign check" });
    expect(rows[0]?.amountMinor).toBe(12_345);

    await updateTransaction(connection.db, id, { amountMinor: -500 });
    const updated = await listTransactions(connection.db, { search: "sign check" });
    expect(updated[0]?.amountMinor).toBe(500);

    await deleteTransaction(connection.db, id);
    expect(await listTransactions(connection.db, { search: "sign check" })).toHaveLength(0);
  });
});

describe("balances", () => {
  it("derives account balances including both sides of a transfer", async () => {
    const accounts = await listAccounts(connection.db);
    const bank = accounts.find((account) => account.slug === "maribank")!;
    const unionbank = accounts.find((account) => account.slug === "unionbank")!;
    const cash = accounts.find((account) => account.slug === "cash")!;

    // in 20,000 + 40,000, out 1,500 + 1,500, 10,000 transferred away
    expect(bank.balanceMinor).toBe(2_000_000 + 4_000_000 - 150_000 - 150_000 - 1_000_000);
    expect(unionbank.balanceMinor).toBe(1_000_000);
    expect(cash.balanceMinor).toBe(-250_000 - 45_000 - 100_000);
  });

  it("nets to the same total across accounts", async () => {
    const accounts = await listAccounts(connection.db);
    const sum = accounts.reduce((total, account) => total + account.balanceMinor, 0);
    expect(await netWorth(connection.db)).toBe(sum);
  });
});

describe("analytics", () => {
  it("excludes transfers from income and expense totals", async () => {
    const totals = await monthTotals(connection.db, MONTH);
    expect(totals.incomeMinor).toBe(6_000_000);
    expect(totals.expenseMinor).toBe(150_000 + 150_000 + 250_000 + 45_000);
  });

  it("groups spending into the seven top-level groups", async () => {
    const rows = await spendByGroup(connection.db, MONTH);
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
    const rows = await monthlyTotals(connection.db, months[0]!, MONTH);
    const series = buildCashflowSeries(rows, months);
    expect(series).toHaveLength(6);
    expect(series.at(-1)?.netMinor).toBe(6_000_000 - 595_000);
    expect(series.at(0)?.incomeMinor).toBe(0);
  });

  it("splits income by source", async () => {
    const rows = await incomeBySource(connection.db, MONTH);
    expect(rows[0]?.shortName).toBe("Live Luxe");
    expect(rows[0]?.amountMinor).toBe(4_000_000);
    expect(rows[1]?.amountMinor).toBe(2_000_000);
  });

  it("ranks the largest expenses", async () => {
    const rows = await largestExpenses(connection.db, MONTH, 3);
    expect(rows.map((row) => row.payee)).toEqual(["Installment", "Internet bill", "Electricity bill"]);
  });
});

describe("budgets", () => {
  it("counts subcategory spending against a group budget", async () => {
    const foodId = await idOf("food");
    await upsertBudget(connection.db, {
      categoryId: foodId,
      amountMinor: 100_000,
      startMonth: MONTH,
    });

    const rows = await listBudgetsForMonth(connection.db, MONTH, new Date(2026, 8, 30));
    const food = rows.find((row) => row.categoryId === foodId);
    expect(food?.spentMinor).toBe(45_000);
    expect(food?.verdict.state).toBe("ok");
    expect(food?.verdict.remainingMinor).toBe(55_000);
  });

  it("updates in place rather than stacking duplicates", async () => {
    const foodId = await idOf("food");
    await upsertBudget(connection.db, {
      categoryId: foodId,
      amountMinor: 40_000,
      startMonth: MONTH,
    });
    const rows = await listBudgetsForMonth(connection.db, MONTH, new Date(2026, 8, 30));
    expect(rows.filter((row) => row.categoryId === foodId)).toHaveLength(1);
    expect(rows.find((row) => row.categoryId === foodId)?.verdict.state).toBe("over");
  });
});

describe("planned payments", () => {
  it("projects the next due date for the seeded bills", async () => {
    const rows = await listPlanned(connection.db, { from: `${MONTH}-10` });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.nextDueDate !== null)).toBe(true);
    const internet = rows.find((row) => row.name.startsWith("Internet"));
    expect(internet?.nextDueDate).toBe("2026-10-01");
    expect(internet?.categoryName).toBe("Internet");
  });

  it("lists only what falls inside the horizon", async () => {
    const rows = await listUpcoming(connection.db, 0);
    expect(rows.length).toBeLessThanOrEqual(4);
  });

  it("posts an occurrence as a real record and marks it paid", async () => {
    const planned = await listPlanned(connection.db, { from: `${MONTH}-10` });
    const electricity = planned.find((row) => row.name.startsWith("Electricity"))!;

    const transactionId = await postPlanned(connection.db, electricity.id, {
      date: `${MONTH}-25`,
      amountMinor: 187_500,
    });
    expect(transactionId).toBeTruthy();

    const rows = await listTransactions(connection.db, { search: "Electricity" });
    const posted = rows.find((row) => row.date === `${MONTH}-25`);
    expect(posted?.amountMinor).toBe(187_500);
    expect(posted?.plannedPaymentId).toBe(electricity.id);

    const after = await listPlanned(connection.db, { from: `${MONTH}-10` });
    expect(after.find((row) => row.id === electricity.id)?.lastPostedDate).toBe(`${MONTH}-25`);
  });
});

describe("planned payments, undone", () => {
  it("undoing a post removes the record it created", async () => {
    const planned = await listPlanned(connection.db, { from: `${MONTH}-10` });
    const internet = planned.find((row) => row.name.startsWith("Internet"))!;

    await postPlanned(connection.db, internet.id, { date: `${MONTH}-26` });
    expect(
      (await listTransactions(connection.db, { search: "internet" })).some(
        (row) => row.date === `${MONTH}-26`,
      ),
    ).toBe(true);

    await unpostPlanned(connection.db, internet.id);

    const after = await listPlanned(connection.db, { from: `${MONTH}-10` });
    const row = after.find((entry) => entry.id === internet.id);
    expect(row?.lastPostedDate).toBeNull();
    expect(row?.postedForCurrent).toBe(false);
    expect(
      (await listTransactions(connection.db, { search: "internet" })).some(
        (entry) => entry.date === `${MONTH}-26`,
      ),
    ).toBe(false);
  });
});


/**
 * The seed only runs on an empty database, so anyone who opened the app before
 * the real wallets existed would never see them. That gap is closed by a data
 * migration, and this is the shape it has to cope with.
 */
describe("upgrading a database built before the real accounts existed", () => {
  const LEGACY = [
    { slug: "cash", name: "Cash", type: "cash" as const, icon: "Banknote", sortOrder: 0 },
    { slug: "gcash", name: "GCash", type: "ewallet" as const, icon: "Smartphone", sortOrder: 1 },
    { slug: "bank", name: "Bank Account", type: "bank" as const, icon: "Landmark", sortOrder: 2 },
    { slug: "savings", name: "Savings", type: "savings" as const, icon: "PiggyBank", sortOrder: 3 },
  ];

  const dataMigration = () => {
    const found = migrations.find((entry) => entry.name.startsWith("data/0001"));
    if (!found) throw new Error("data/0001 migration is missing");
    return found;
  };

  async function legacyConnection() {
    const connection = await createTestConnection({ seed: false });
    await connection.db.delete(accountsTable);
    await connection.db.insert(accountsTable).values(
      LEGACY.map((account) => ({
        ...account,
        id: crypto.randomUUID(),
        openingBalanceMinor: 0,
        currency: "PHP",
        createdAt: new Date().toISOString(),
      })),
    );
    return connection;
  }

  const apply = (connection: TestConnection) =>
    connection.runner.batch(
      dataMigration().statements.map((sql) => ({ sql, params: [], method: "run" as const })),
    );

  it("adds the missing wallets without touching any balance", async () => {
    const connection = await legacyConnection();
    await apply(connection);

    const rows = await listAccounts(connection.db);
    const bySlug = new Map(rows.map((row) => [row.slug, row]));

    expect(bySlug.get("maribank")).toBeDefined();
    expect(bySlug.get("unionbank")).toBeDefined();
    expect(bySlug.get("wise")).toBeDefined();

    // The migration fills in missing wallets and touches nobody's balance.
    const opening = rows.reduce((sum, row) => sum + row.openingBalanceMinor, 0);
    expect(opening).toBe(0);

    // The placeholders survive - records may point at them - but sink below.
    expect(bySlug.get("bank")).toBeDefined();
    expect(bySlug.get("savings")).toBeDefined();
    expect(rows.slice(0, 5).map((row) => row.slug)).toEqual([
      "maribank",
      "unionbank",
      "gcash",
      "wise",
      "cash",
    ]);

    connection.close();
  });

  it("is safe to run twice", async () => {
    const connection = await legacyConnection();
    await apply(connection);
    const first = await listAccounts(connection.db);
    await apply(connection);
    const second = await listAccounts(connection.db);

    expect(second).toHaveLength(first.length);
    expect(second.map((row) => row.slug)).toEqual(first.map((row) => row.slug));

    connection.close();
  });

  it("never overwrites a balance someone typed in", async () => {
    const connection = await legacyConnection();
    const rows = await listAccounts(connection.db);
    const cash = rows.find((row) => row.slug === "cash")!;
    await updateAccount(connection.db, cash.id, { openingBalanceMinor: 12_345 });

    await apply(connection);

    const after = await listAccounts(connection.db);
    expect(after.find((row) => row.slug === "cash")?.openingBalanceMinor).toBe(12_345);

    connection.close();
  });
});

describe("wallet", () => {
  it("seeds the real accounts with their counted balances", async () => {
    const wallet = await loadWallet(connection.db, MONTH);
    expect(wallet.accounts.map((account) => account.slug)).toEqual([
      "maribank",
      "unionbank",
      "gcash",
      "wise",
      "cash",
    ]);
    // A fresh database opens every wallet at zero; balances arrive by import.
    const opening = wallet.accounts.reduce(
      (sum, account) => sum + account.openingBalanceMinor,
      0,
    );
    expect(opening).toBe(0);
  });

  it("keeps the all-time balance apart from the month's movement", async () => {
    const wallet = await loadWallet(connection.db, MONTH);
    const cash = wallet.accounts.find((account) => account.slug === "cash")!;

    // Cash carries the installment and groceries expenses, plus last month's.
    expect(cash.spentMinor).toBe(250_000 + 45_000);
    expect(cash.receivedMinor).toBe(0);
    // The balance also counts August, which the month figures must not.
    expect(cash.balanceMinor).toBe(-250_000 - 45_000 - 100_000);
  });

  it("counts both halves of a transfer against the right accounts", async () => {
    const wallet = await loadWallet(connection.db, MONTH);
    const bank = wallet.accounts.find((account) => account.slug === "maribank")!;
    const union = wallet.accounts.find((account) => account.slug === "unionbank")!;

    expect(bank.transferredOutMinor).toBe(1_000_000);
    expect(union.transferredInMinor).toBe(1_000_000);

    // A transfer is neither spending nor income on either side.
    const onBank = await listTransactions(connection.db, {
      accountId: bank.id,
      dateFrom: `${MONTH}-01`,
      dateTo: `${MONTH}-30`,
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
    const before = await loadWallet(connection.db, MONTH);
    const union = before.accounts.find((account) => account.slug === "unionbank")!;

    await updateAccount(connection.db, union.id, { excludeFromTotals: true });
    const after = await loadWallet(connection.db, MONTH);

    expect(after.totals.accountCount).toBe(before.totals.accountCount - 1);
    expect(after.totals.balanceMinor).toBe(before.totals.balanceMinor - union.balanceMinor);

    await updateAccount(connection.db, union.id, { excludeFromTotals: false });
  });
});

describe("outlook", () => {
  it("combines logged records with the occurrences still to come", async () => {
    const entries = await outlookEntries(connection.db, `${MONTH}-01`, `${MONTH}-30`);

    const logged = entries.filter((entry) => entry.kind === "logged");
    const planned = entries.filter((entry) => entry.kind === "planned");
    expect(logged.length).toBeGreaterThan(0);
    expect(planned.length).toBeGreaterThan(0);

    // Sorted by date, then income before spending on the same day.
    const dates = entries.map((entry) => entry.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("leaves transfers out of both sides", async () => {
    const entries = await outlookEntries(connection.db, `${MONTH}-01`, `${MONTH}-30`);
    expect(entries.some((entry) => entry.label === "Move to savings")).toBe(false);
    expect(entries.every((entry) => entry.direction !== ("transfer" as never))).toBe(true);
  });

  it("does not count an occurrence that has already been posted", async () => {
    const before = await outlookEntries(connection.db, "2027-06-01", "2027-06-30");
    const internetRows = before.filter((entry) => entry.label.startsWith("Internet"));
    expect(internetRows).toHaveLength(1);
    expect(internetRows[0]?.kind).toBe("planned");

    // Post June's occurrence: it becomes a record, so the projection drops it.
    const schedules = await listPlanned(connection.db, { from: "2027-06-01" });
    const schedule = schedules.find((row) => row.name.startsWith("Internet"))!;
    await postPlanned(connection.db, schedule.id, { date: "2027-06-01" });

    const after = await outlookEntries(connection.db, "2027-06-01", "2027-06-30");
    const june = after.filter((entry) => entry.label.startsWith("Internet"));
    expect(june).toHaveLength(1);
    expect(june[0]?.kind).toBe("logged");

    await unpostPlanned(connection.db, schedule.id);
  });

  it("expands a weekly schedule across the window", async () => {
    const accounts = await listAccounts(connection.db);
    await createPlanned(connection.db, {
      name: "Weekly payout",
      type: "income",
      amountMinor: 1_000_000,
      frequency: "weekly",
      anchorDate: "2027-07-06",
      accountId: accounts[0]!.id,
      active: true,
    });

    const entries = await outlookEntries(connection.db, "2027-07-01", "2027-07-31");
    const weekly = entries.filter((entry) => entry.label === "Weekly payout");
    expect(weekly.map((entry) => entry.date)).toEqual([
      "2027-07-06",
      "2027-07-13",
      "2027-07-20",
      "2027-07-27",
    ]);
    expect(weekly.every((entry) => entry.kind === "planned")).toBe(true);
  });

  it("feeds an outlook whose totals reconcile with its buckets", async () => {
    const entries = await outlookEntries(connection.db, "2027-07-01", "2027-09-30");
    const outlook = buildOutlook(entries, "2027-07-01", "2027-09-30", { today: "2026-09-19" });

    const bucketNet = outlook.buckets.reduce((sum, bucket) => sum + bucket.netMinor, 0);
    expect(bucketNet).toBe(outlook.totals.netMinor);
    expect(outlook.totals.loggedNetMinor + outlook.totals.plannedNetMinor).toBe(
      outlook.totals.netMinor,
    );
    expect(outlook.todayBucket).toBeNull();
  });
});

describe("settings and portability", () => {
  it("round-trips settings", async () => {
    expect((await readSettings(connection.db)).currency).toBe("PHP");
    await writeSettings(connection.db, { currency: "AUD", theme: "light" });
    const settings = await readSettings(connection.db);
    expect(settings.currency).toBe("AUD");
    expect(settings.theme).toBe("light");
    await writeSettings(connection.db, { currency: "PHP", theme: "dark" });
  });

  it("exports every table", async () => {
    const backup = await exportBackup(connection.db);
    expect(backup.format).toBe("advantage-backup");
    expect(backup.tables.transactions.length).toBeGreaterThan(5);
    expect(backup.tables.categories.length).toBeGreaterThan(40);
  });

  it("imports a dated plan into Planned, never into the ledger", async () => {
    const balancesBefore = (await listAccounts(connection.db)).map((row) => row.balanceMinor);
    const ledgerBefore = (await listTransactions(connection.db, { limit: 999 })).length;
    // Counted rather than hard-coded: earlier tests in this file add schedules.
    const scheduledBefore = (await listPlanned(connection.db, { includeInactive: true })).length;

    const summary = await importPlan(connection.db, {
      format: "advantage-plan",
      version: 1,
      replaceExisting: true,
      planned: [
        {
          name: "Live Luxe weekly pay",
          type: "income",
          amount: 10000,
          date: "2026-09-22",
          frequency: "weekly",
          category: "income-rental",
          account: "maribank",
          source: "live-luxe",
        },
        {
          name: "Family support",
          type: "expense",
          amount: 10000,
          date: "2026-12-20",
          frequency: "monthly",
          endDate: "2027-02-28",
          category: "home-support",
          account: "maribank",
        },
        {
          name: "Installment",
          type: "expense",
          amount: 2500,
          date: "2026-10-17",
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
    expect((await listAccounts(connection.db)).map((row) => row.balanceMinor)).toEqual(
      balancesBefore,
    );
    expect((await listTransactions(connection.db, { limit: 999 })).length).toBe(ledgerBefore);

    const rows = await listPlanned(connection.db, { from: "2026-09-19" });
    expect(rows).toHaveLength(3);

    const weekly = rows.find((row) => row.name === "Live Luxe weekly pay");
    expect(weekly?.frequency).toBe("weekly");
    expect(weekly?.nextDueDate).toBe("2026-09-22");
    expect(weekly?.sourceName).toBe("Live Luxe");

    const oneOff = rows.find((row) => row.name === "Installment");
    expect(oneOff?.amountMinor).toBe(250_000);
    expect(oneOff?.categoryName).toBe("Cash Loan");

    // A series stops producing dates once it is past its end.
    const afterEnd = await listPlanned(connection.db, { from: "2027-03-01" });
    expect(afterEnd.find((row) => row.name === "Family support")?.nextDueDate).toBeNull();
    // ...and a one-off that has already fired stops offering a date too.
    expect(afterEnd.find((row) => row.name === "Installment")?.nextDueDate).toBeNull();
  });

  it("rejects a file that is not a plan", async () => {
    await expect(importPlan(connection.db, { format: "something-else" })).rejects.toThrow(
      /not an advantage plan file/i,
    );
  });

  it("imports plain records by slug and name", async () => {
    const summary = await importRecords(connection.db, {
      format: "advantage-records",
      version: 1,
      records: [
        {
          type: "expense",
          amount: 1500,
          date: `${PREVIOUS}-20`,
          category: "loans-bnpl",
          account: "GCash",
          payee: "Lender",
        },
        {
          type: "income",
          amount: 25000,
          date: `${PREVIOUS}-05`,
          category: "Salary",
          source: "Mentis",
          account: "maribank",
        },
        { type: "expense", amount: 500, date: `${PREVIOUS}-21`, category: "Nope" },
      ],
    });

    expect(summary.inserted).toBe(3);
    expect(summary.unresolvedCategories).toEqual(["Nope"]);

    const rows = await listTransactions(connection.db, { search: "lender" });
    expect(rows[0]?.amountMinor).toBe(150_000);
    expect(rows[0]?.accountName).toBe("GCash");
  });
});
