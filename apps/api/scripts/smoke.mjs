/**
 * End-to-end smoke test against a running API.
 *
 *   npm run dev -w @advantage/api      # in another terminal
 *   node apps/api/scripts/smoke.mjs
 *
 * The important part is the last section. Two people sign up, both get their
 * own seeded ledger, and then user B is pointed at every one of user A's row
 * ids in turn. Nothing may come back. A missing WHERE clause leaks someone's
 * salary and debts, so this is the test that decides whether the tenancy model
 * is right - not one written after the first users arrive.
 */

import { readFileSync } from "node:fs";

const BASE = process.env.API_URL ?? "http://localhost:4000";

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${label}`);
    return true;
  }
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
  return false;
}

/**
 * A browser-shaped client: it keeps the session cookie between calls, and it
 * sends an Origin, because Better Auth refuses a state-changing request
 * without one and that refusal is a feature worth exercising.
 */
const ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

function makeClient() {
  // Better Auth sets two cookies - the session token and the short-lived
  // cached session - so this is a jar, not a single value.
  const jar = new Map();

  return async function call(method, path, body) {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    for (const entry of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = entry.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1);

      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (expired || value === "") jar.delete(name);
      else jar.set(name, value);
    }

    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: response.status, body: json };
  };
}

async function signUp(call, email) {
  const result = await call("POST", "/api/auth/sign-up/email", {
    email,
    password: "correct-horse-battery",
    name: email.split("@")[0],
  });
  if (result.status >= 400) {
    throw new Error(`sign-up failed (${result.status}): ${JSON.stringify(result.body)}`);
  }
  return result;
}

const stamp = Date.now();
const alice = makeClient();
const bob = makeClient();

console.log(`\nadVantage API smoke test - ${BASE}\n`);

// ---- health ----------------------------------------------------------------

console.log("Service");
{
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  check("health responds", health.ok === true);

  const anon = await fetch(`${BASE}/api/accounts`);
  check("an unauthenticated read is refused", anon.status === 401, `got ${anon.status}`);
}

// ---- sign-up and the first-run seed ----------------------------------------

console.log("\nSign-up and seeding");
await signUp(alice, `alice+${stamp}@example.test`);
check("alice can sign up", true);

{
  const me = await alice("GET", "/api/me");
  check("the session resolves to a user", me.status === 200 && Boolean(me.body?.id));

  const accounts = await alice("GET", "/api/accounts");
  check("a new account starts with cash alone", accounts.body?.length === 1, `got ${accounts.body?.length}`);
  check("and nothing in it", accounts.body?.[0]?.balanceMinor === 0);

  const sources = await alice("GET", "/api/income-sources");
  check("one generic income source", sources.body?.length === 1, `got ${sources.body?.length}`);
  check("which is text only", sources.body?.[0]?.logo === null);

  const tree = await alice("GET", "/api/categories/tree?kind=expense");
  check("seven expense groups", tree.body?.length === 7, `got ${tree.body?.length}`);

  const planned = await alice("GET", "/api/planned");
  check("three planned payments", planned.body?.length === 3, `got ${planned.body?.length}`);

  const settings = await alice("GET", "/api/settings");
  check("settings default to PHP", settings.body?.currency === "PHP");
}

// ---- writing and deriving ---------------------------------------------------

console.log("\nThe shared account catalog");
{
  const catalog = (await alice("GET", "/api/catalog")).body;
  check("the catalog is readable", Array.isArray(catalog) && catalog.length > 0, `${catalog?.length} entries`);

  const gcashEntry = catalog.find((entry) => entry.slug === "gcash");
  check("and carries logos", Boolean(gcashEntry?.logoUrl), gcashEntry?.logoUrl ?? "none");

  // A brand mark is not anyone's financial data, so it loads without a session.
  const anonLogo = await fetch(`${BASE}${gcashEntry.logoUrl}`);
  check("a logo loads without signing in", anonLogo.status === 200, `got ${anonLogo.status}`);
  check(
    "and says it is an image",
    (anonLogo.headers.get("content-type") ?? "").startsWith("image/"),
    anonLogo.headers.get("content-type") ?? "none",
  );

  const added = await alice("POST", "/api/accounts/from-catalog", { catalogSlug: "maribank" });
  check("a catalog account can be added", added.status === 201, JSON.stringify(added.body));
  await alice("POST", "/api/accounts/from-catalog", { catalogSlug: "gcash" });

  const again = await alice("POST", "/api/accounts/from-catalog", { catalogSlug: "maribank" });
  check("adding the same one twice is refused", again.status === 409, `got ${again.status}`);

  const missing = await alice("POST", "/api/accounts/from-catalog", { catalogSlug: "not-a-bank" });
  check("an unknown slug is refused", missing.status === 404, `got ${missing.status}`);

  const wallets = (await alice("GET", "/api/accounts")).body;
  const mari = wallets.find((a) => a.slug === "maribank");
  check("the added wallet carries the catalog logo", Boolean(mari?.logoUrl), mari?.logoUrl ?? "none");
  check("cash has none, and falls back to a glyph", wallets.find((a) => a.slug === "cash")?.logoUrl === null);
}


console.log("\nRecords and derived figures");
const aliceAccounts = (await alice("GET", "/api/accounts")).body;
const maribank = aliceAccounts.find((a) => a.slug === "maribank");
const gcash = aliceAccounts.find((a) => a.slug === "gcash");
const options = (await alice("GET", "/api/categories/options?kind=expense")).body;
const groceries = options.find((o) => o.name === "Groceries");

const today = new Date();
const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const date = `${month}-15`;

let expenseId;
{
  const created = await alice("POST", "/api/transactions", {
    type: "expense",
    amountMinor: 125_00,
    date,
    accountId: maribank.id,
    categoryId: groceries.id,
    payee: "Landers",
  });
  check("an expense saves", created.status === 201, JSON.stringify(created.body));
  expenseId = created.body?.id;

  await alice("POST", "/api/transactions", {
    type: "income",
    amountMinor: 50_000_00,
    date,
    accountId: maribank.id,
  });

  await alice("POST", "/api/transactions", {
    type: "transfer",
    amountMinor: 1_000_00,
    date,
    accountId: maribank.id,
    toAccountId: gcash.id,
  });

  const after = (await alice("GET", "/api/accounts")).body;
  const mari = after.find((a) => a.id === maribank.id);
  const gc = after.find((a) => a.id === gcash.id);

  // 50,000 in, 125 spent, 1,000 moved out.
  check(
    "the sending account's balance is derived correctly",
    mari.balanceMinor === 50_000_00 - 125_00 - 1_000_00,
    `got ${mari.balanceMinor}`,
  );
  check(
    "the receiving half of the transfer lands",
    gc.balanceMinor === 1_000_00,
    `got ${gc.balanceMinor}`,
  );

  const dashboard = (await alice("GET", `/api/dashboard?month=${month}&locale=en-PH`)).body;
  check("dashboard income", dashboard.kpis.incomeMinor === 50_000_00);
  check("dashboard spending excludes the transfer", dashboard.kpis.expenseMinor === 125_00);
  check(
    "net worth is the sum of both wallets",
    dashboard.netWorthMinor === 50_000_00 - 125_00,
    `got ${dashboard.netWorthMinor}`,
  );
  check("the breakdown found the group", dashboard.breakdown.slices[0]?.label === "Food & Dining");
  check("six months of cash flow", dashboard.cashflow.length === 6);

  const wallet = (await alice("GET", `/api/wallet?month=${month}`)).body;
  check("wallet totals match", wallet.totals.balanceMinor === 50_000_00 - 125_00);
  check("wallet spending is month-scoped", wallet.totals.spentMinor === 125_00);

  const search = (await alice("GET", "/api/transactions?search=lander")).body;
  check("case-insensitive search finds the payee", search.length === 1, `got ${search.length}`);

  const filtered = (await alice("GET", `/api/transactions?types=expense&accountId=${maribank.id}`))
    .body;
  check("type and account filters combine", filtered.length === 1, `got ${filtered.length}`);
}

// ---- budgets, planned, outlook ----------------------------------------------

console.log("\nBudgets, schedule and outlook");
{
  const foodGroup = options.find((o) => o.name === "Food & Dining");
  await alice("PUT", "/api/budgets", {
    categoryId: foodGroup.id,
    amountMinor: 500_00,
    startMonth: month,
  });

  const budgets = (await alice("GET", `/api/budgets?month=${month}`)).body;
  check(
    "a budget on a group counts its subcategories",
    budgets[0]?.spentMinor === 125_00,
    `got ${budgets[0]?.spentMinor}`,
  );

  const planned = (await alice("GET", "/api/planned")).body;
  const internet = planned.find((p) => p.name === "Internet");
  const posted = await alice("POST", `/api/planned/${internet.id}/post`, {});
  check("a planned payment posts to a record", posted.status === 201);

  const afterPost = (await alice("GET", "/api/planned")).body.find((p) => p.id === internet.id);
  check("posting marks the occurrence", afterPost.postedForCurrent === true);

  await alice("POST", `/api/planned/${internet.id}/unpost`);
  const afterUnpost = (await alice("GET", "/api/planned")).body.find((p) => p.id === internet.id);
  check("unposting clears the marker", afterUnpost.lastPostedDate === null);

  const stats = (await alice("GET", "/api/stats")).body;
  check("the record it created was removed too", stats.transactions === 3, `got ${stats.transactions}`);

  // Income sources are the user's own list now, not a fixture.
  const created = await alice("POST", "/api/income-sources", { name: "Acme Corp" });
  check("an income source can be added", created.status === 201, JSON.stringify(created.body));

  const withNew = (await alice("GET", "/api/income-sources")).body;
  check("and shows up in the list", withNew.length === 2, `got ${withNew.length}`);
  check("with a chart colour of its own", withNew.some((s) => s.name === "Acme Corp" && s.color));

  await alice("POST", `/api/income-sources/${created.body.id}/archive`);
  check(
    "archiving takes it out of the picker",
    (await alice("GET", "/api/income-sources")).body.length === 1,
  );

  const outlook = (await alice("GET", `/api/outlook?from=${month}-01&to=${month}-28`)).body;
  check("outlook mixes logged and planned", outlook.entries.some((e) => e.kind === "planned"));
  check("outlook excludes transfers", !outlook.entries.some((e) => e.label === null));
}

// ---- backup round trip -------------------------------------------------------

console.log("\nBackup");
{
  const backup = (await alice("GET", "/api/backup")).body;
  check("the export names its format", backup.format === "advantage-backup");
  check("no userId leaks into the file", backup.tables.accounts.every((a) => !("userId" in a)));

  const before = (await alice("GET", "/api/stats")).body;
  await alice("POST", "/api/import/backup", backup);
  const after = (await alice("GET", "/api/stats")).body;
  check(
    "restoring its own backup is a no-op",
    JSON.stringify(before) === JSON.stringify(after),
    `${JSON.stringify(before)} vs ${JSON.stringify(after)}`,
  );
}

// ---- the one that matters ----------------------------------------------------

console.log("\nTenant isolation");
await signUp(bob, `bob+${stamp}@example.test`);

{
  const bobAccounts = (await bob("GET", "/api/accounts")).body;
  check("bob gets his own seeded ledger", bobAccounts.length === 1);
  check(
    "and none of alice's rows",
    !bobAccounts.some((a) => aliceAccounts.some((other) => other.id === a.id)),
  );

  const bobDashboard = (await bob("GET", `/api/dashboard?month=${month}&locale=en-PH`)).body;
  check("bob's figures are his own", bobDashboard.kpis.incomeMinor === 0);
  check("and his net worth is zero", bobDashboard.netWorthMinor === 0);

  // Every read path, pointed at a row that is not his.
  const read = await bob("GET", `/api/transactions/${expenseId}`);
  check("bob cannot read alice's record", read.status === 404, `got ${read.status}`);

  const bobBefore = (await bob("GET", "/api/stats")).body;

  // Every write path, pointed at a row that is not his. These answer 204
  // because `updateMany` matched nothing - the check is that alice's row is
  // untouched afterwards, not the status code.
  await bob("PATCH", `/api/transactions/${expenseId}`, { amountMinor: 1 });
  await bob("DELETE", `/api/transactions/${expenseId}`);
  await bob("PATCH", `/api/accounts/${maribank.id}`, { name: "Taken over" });
  await bob("POST", `/api/accounts/${maribank.id}/archive`);

  const aliceRecord = (await alice("GET", `/api/transactions/${expenseId}`)).body;
  check("alice's amount is unchanged", aliceRecord.amountMinor === 125_00);

  const aliceMari = (await alice("GET", "/api/accounts")).body.find((a) => a.id === maribank.id);
  check("alice's account was not renamed", aliceMari?.name === "Maribank");
  check("alice's account was not archived", aliceMari?.archivedAt === null);

  const bobAfter = (await bob("GET", "/api/stats")).body;
  check(
    "bob's own ledger is unchanged by all that",
    JSON.stringify(bobBefore) === JSON.stringify(bobAfter),
  );

  // The one the roadmap singles out: a restore used to delete every row in
  // every table before inserting. Unscoped, that is a cross-tenant wipe
  // triggered by a file upload.
  const aliceStats = (await alice("GET", "/api/stats")).body;
  await bob("POST", "/api/import/backup", {
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

  const aliceStatsAfter = (await alice("GET", "/api/stats")).body;
  check(
    "an empty restore by bob does not wipe alice",
    JSON.stringify(aliceStats) === JSON.stringify(aliceStatsAfter),
    `${JSON.stringify(aliceStats)} vs ${JSON.stringify(aliceStatsAfter)}`,
  );
  check("but it did clear bob's own ledger", (await bob("GET", "/api/stats")).body.accounts === 0);
}

// ---- the admin surface -------------------------------------------------------

console.log("\nAdmin");
{
  // Neither of these accounts is in ADMIN_EMAILS, so the whole surface should
  // behave as though it is not there. 404 rather than 403: someone who is not
  // an admin has no business learning that these routes exist.
  check("/api/me reports a non-admin", (await alice("GET", "/api/me")).body?.isAdmin === false);

  for (const [method, path] of [
    ["GET", "/api/admin/metrics"],
    ["GET", "/api/admin/catalog"],
    ["POST", "/api/admin/catalog"],
  ]) {
    const result = await alice(method, path, method === "POST" ? { name: "Sneaky" } : undefined);
    check(`${method} ${path} is hidden from a normal user`, result.status === 404, `got ${result.status}`);
  }

  // And it changed nothing.
  const catalog = (await alice("GET", "/api/catalog")).body;
  check("the catalog is unchanged by all that", !catalog.some((e) => e.name === "Sneaky"));
}

// ---- the admin, doing admin things -------------------------------------------

const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? "admin@example.test";
const admin = makeClient();

console.log("\nAdmin, with the rights");
{
  // Only runs when the service was started with this address in ADMIN_EMAILS.
  const signedUp = await admin("POST", "/api/auth/sign-up/email", {
    email: adminEmail,
    password: "correct-horse-battery",
    name: "Admin",
  });
  if (signedUp.status >= 400) {
    await admin("POST", "/api/auth/sign-in/email", {
      email: adminEmail,
      password: "correct-horse-battery",
    });
  }

  const me = await admin("GET", "/api/me");
  if (me.body?.isAdmin !== true) {
    console.log(`  skip  ${adminEmail} is not in ADMIN_EMAILS - skipping the admin checks`);
  } else {
    check("the configured address is an admin", true);

    // An admin account administers the service and has no ledger of its own.
    // Not hidden, not empty - refused, and never seeded in the first place.
    for (const [method, path] of [
      ["GET", "/api/accounts"],
      ["GET", "/api/transactions"],
      ["GET", "/api/categories/tree"],
      ["GET", "/api/planned"],
      ["GET", "/api/budgets?month=2026-09"],
      ["GET", "/api/settings"],
      ["GET", "/api/income-sources"],
      ["GET", "/api/stats"],
      ["GET", "/api/backup"],
      ["GET", "/api/dashboard?month=2026-09"],
      ["GET", "/api/wallet?month=2026-09"],
      ["POST", "/api/reset"],
    ]) {
      const refused = await admin(method, path, method === "POST" ? {} : undefined);
      check(
        `an admin is refused ${method} ${path.split("?")[0]}`,
        refused.status === 403 && refused.body?.error?.code === "admin_account",
        `got ${refused.status} ${refused.body?.error?.code ?? ""}`,
      );
    }

    // And nothing was created for it behind the scenes.
    const adminRows = await admin("GET", "/api/stats");
    check("no ledger is seeded for an admin", adminRows.status === 403);

    const metrics = (await admin("GET", "/api/admin/metrics")).body;
    check("metrics are readable", typeof metrics?.users?.total === "number", JSON.stringify(metrics?.users));
    check("and count people", metrics.users.total >= 2, `${metrics.users.total} users`);
    check("twelve weeks of sign-ups", metrics.signupsByWeek?.length === 12);
    check(
      "no amount, payee or per-user row anywhere in them",
      !/amount|payee|note|email/i.test(JSON.stringify(metrics)),
    );

    const square = readFileSync("icons/gcash.png").toString("base64");
    const oblong = readFileSync("icons/mentis.png").toString("base64");

    // A fresh name each run: catalog entries are archived rather than deleted,
    // so a fixed slug would collide with the last run's leftovers.
    const payName = `PayPal ${stamp}`;
    const paySlug = `paypal-${stamp}`;

    const created = await admin("POST", "/api/admin/catalog", {
      name: payName,
      type: "ewallet",
      icon: "Wallet",
      logo: square,
    });
    check("an admin can add a catalog account", created.status === 201, JSON.stringify(created.body));
    check("its slug is derived from the name", created.body?.slug === paySlug, created.body?.slug);
    check("and it carries the uploaded logo", Boolean(created.body?.logoUrl));

    const rejected = await admin("POST", "/api/admin/catalog", {
      name: "Oblong Bank",
      type: "bank",
      icon: "Landmark",
      logo: oblong,
    });
    check("a logo that is not square is refused", rejected.status === 400, `got ${rejected.status}`);
    check(
      "and the refusal names the dimensions",
      /684x200/.test(rejected.body?.error?.message ?? ""),
      rejected.body?.error?.message,
    );

    const notAnImage = await admin("POST", "/api/admin/catalog", {
      name: "Junk",
      type: "bank",
      icon: "Landmark",
      logo: Buffer.from("this is not an image at all").toString("base64"),
    });
    check("a file that is not an image is refused", notAnImage.status === 400, `got ${notAnImage.status}`);

    // A user can now add what the admin just published - the whole point.
    const visible = (await alice("GET", "/api/catalog")).body;
    check("the new account reaches everyone", visible.some((e) => e.slug === paySlug));

    const adopted = await alice("POST", "/api/accounts/from-catalog", { catalogSlug: paySlug });
    check("and a user can add it", adopted.status === 201, JSON.stringify(adopted.body));

    const renamed = await admin("PATCH", `/api/admin/catalog/${created.body.id}`, {
      name: `${payName} Business`,
    });
    check("an admin can rename an entry", renamed.body?.name === `${payName} Business`);

    const usersAccount = (await alice("GET", "/api/accounts")).body.find((a) => a.slug === paySlug);
    check("without renaming anybody's own account", usersAccount?.name === payName, usersAccount?.name);

    const replaced = await admin("PATCH", `/api/admin/catalog/${created.body.id}`, { logo: oblong });
    check("replacing a logo is checked too", replaced.status === 400, `got ${replaced.status}`);

    const hidden = await admin("POST", `/api/admin/catalog/${created.body.id}/archive`, {
      archived: true,
    });
    check("an admin can hide an entry", Boolean(hidden.body?.archivedAt));
    check(
      "which takes it out of the public catalog",
      !(await alice("GET", "/api/catalog")).body.some((e) => e.slug === paySlug),
    );
    check(
      "but leaves the wallet that already has it alone",
      (await alice("GET", "/api/accounts")).body.some((a) => a.slug === paySlug),
    );

    await admin("DELETE", "/api/me");
  }
}

// ---- account deletion --------------------------------------------------------

console.log("\nAccount deletion");
{
  const deleted = await bob("DELETE", "/api/me");
  check("bob can delete his account", deleted.status === 200);

  const after = await bob("GET", "/api/accounts");
  check("his session no longer resolves", after.status === 401, `got ${after.status}`);

  const aliceStillThere = await alice("GET", "/api/stats");
  check("alice is unaffected", aliceStillThere.status === 200);
}

console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
