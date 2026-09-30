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

  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

  function absorb(response) {
    for (const entry of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = entry.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1);

      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (expired || value === "") jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function call(method, path, body) {
    const cookie = cookieHeader();

    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    absorb(response);

    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: response.status, body: json };
  }

  /**
   * Open a link from an email the way a browser would: one GET, no Origin
   * header, and the redirect left for the caller to read rather than followed.
   * Cookies it sets land in the same jar, which is how a confirmation link
   * ends up signing the person in.
   */
  call.follow = async (url) => {
    const cookie = cookieHeader();
    const response = await fetch(url, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
    });
    absorb(response);
    return { status: response.status, location: response.headers.get("location") };
  };

  return call;
}

// ---- the mail the service would have sent ------------------------------------
//
// In development nothing is sent: the API writes each message to a file, and
// this reads it. That is what lets a test click the link a real inbox would
// have received, without a mail server and without a route on the API that
// hands out other people's links.

const OUTBOX = new URL("../../../.mail/outbox.jsonl", import.meta.url);

function outbox() {
  try {
    return readFileSync(OUTBOX, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The first message to `to` after position `since` whose subject matches, or null. */
async function waitForMail(to, since, subject) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = outbox()
      .slice(since)
      .find((mail) => mail.to === to.toLowerCase() && (!subject || subject.test(mail.subject)));
    if (found) return found;
    await sleep(100);
  }
  return null;
}

/** The link in a message, from its plain-text body. */
const linkIn = (mail) => mail.text.split(/\s+/).find((word) => word.startsWith("http"));

const PASSWORD = "correct-horse-battery";

/**
 * Create an account the way a person does: sign up, then open the link in the
 * email. Sign-up alone no longer signs anyone in, so anything that needs a
 * working session goes through here.
 */
async function signUp(call, email) {
  const before = outbox().length;
  const result = await call("POST", "/api/auth/sign-up/email", {
    email,
    password: PASSWORD,
    name: email.split("@")[0],
    callbackURL: `${ORIGIN}/verify`,
  });
  if (result.status >= 400) {
    throw new Error(`sign-up failed (${result.status}): ${JSON.stringify(result.body)}`);
  }

  const mail = await waitForMail(email, before, /confirm/i);
  if (!mail) throw new Error(`no confirmation email reached ${email}`);

  const landed = await call.follow(linkIn(mail));
  if (landed.status !== 302) {
    throw new Error(`the confirmation link did not redirect (${landed.status})`);
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

// ---- proving the mailbox -----------------------------------------------------

console.log("\nEmail verification");
const carol = makeClient();
const carolEmail = `carol+${stamp}@example.test`;
{
  const before = outbox().length;
  const created = await carol("POST", "/api/auth/sign-up/email", {
    email: carolEmail,
    password: PASSWORD,
    name: "Carol",
    callbackURL: `${ORIGIN}/verify`,
  });
  check("signing up succeeds", created.status === 200, `got ${created.status}`);
  check("but it does not sign anyone in", created.body?.token === null);
  check("so there is no session yet", (await carol("GET", "/api/me")).status === 401);

  const first = await waitForMail(carolEmail, before, /confirm/i);
  check("a confirmation email is sent to the address", Boolean(first));
  check(
    "its link is on the API",
    Boolean(first) && linkIn(first).includes("/api/auth/verify-email?token="),
  );

  const mailCount = outbox().length;
  const wrong = await carol("POST", "/api/auth/sign-in/email", {
    email: carolEmail,
    password: "not-the-password",
  });
  check("a wrong password is just refused", wrong.status === 401, `got ${wrong.status}`);
  await sleep(400);
  check("and mails nobody", outbox().length === mailCount);

  const blocked = await carol("POST", "/api/auth/sign-in/email", {
    email: carolEmail,
    password: PASSWORD,
    // The browser sends this, so the fresh link knows where to land.
    callbackURL: `${ORIGIN}/verify`,
  });
  check(
    "the right password is refused until the address is confirmed",
    blocked.status === 403,
    `got ${blocked.status}`,
  );
  check(
    "with a code the browser can act on",
    blocked.body?.code === "EMAIL_NOT_VERIFIED",
    JSON.stringify(blocked.body),
  );

  const fresh = await waitForMail(carolEmail, mailCount, /confirm/i);
  check("and a fresh link is sent", Boolean(fresh));
  check("still no session", (await carol("GET", "/api/me")).status === 401);
  check("and the ledger stays shut", (await carol("GET", "/api/accounts")).status === 401);

  const tampered = await carol.follow(linkIn(fresh).replace("token=", "token=x"));
  check(
    "a tampered link is refused",
    tampered.status === 302 && /error=/.test(tampered.location ?? ""),
    JSON.stringify(tampered),
  );
  check("and signs nobody in", (await carol("GET", "/api/me")).status === 401);

  const landed = await carol.follow(linkIn(fresh));
  check(
    "the real link redirects back to the app",
    landed.status === 302 && (landed.location ?? "").startsWith(`${ORIGIN}/verify`),
    JSON.stringify(landed),
  );

  const me = await carol("GET", "/api/me");
  check("and signs the person in", me.status === 200 && me.body?.email === carolEmail);
  check("with a ledger of their own", (await carol("GET", "/api/accounts")).body?.length === 1);

  // Signing up again with an address that is taken must look exactly like
  // signing up with a new one - otherwise the form is a way to look people up.
  const twin = makeClient();
  const beforeTwin = outbox().length;
  const again = await twin("POST", "/api/auth/sign-up/email", {
    email: carolEmail,
    password: "a-different-password",
    name: "Impostor",
    callbackURL: `${ORIGIN}/verify`,
  });
  check(
    "signing up again with a taken address looks identical",
    again.status === 200 && again.body?.token === null,
    `got ${again.status}`,
  );

  const notice = await waitForMail(carolEmail, beforeTwin, /already have/i);
  check("but the real owner is told", Boolean(notice));
  check("and that email carries no token to act on", Boolean(notice) && !/token=/.test(notice.text));

  const impostor = await twin("POST", "/api/auth/sign-in/email", {
    email: carolEmail,
    password: "a-different-password",
  });
  check("the second password does nothing", impostor.status === 401, `got ${impostor.status}`);
}

// ---- forgot password ---------------------------------------------------------

console.log("\nPassword reset");
{
  const anon = makeClient();
  const NEW_PASSWORD = "a-brand-new-passphrase";
  const redirectTo = `${ORIGIN}/reset-password`;

  const ghost = `nobody+${stamp}@example.test`;
  const beforeGhost = outbox().length;
  const unknown = await anon("POST", "/api/auth/request-password-reset", { email: ghost, redirectTo });

  const beforeReal = outbox().length;
  const known = await anon("POST", "/api/auth/request-password-reset", {
    email: carolEmail,
    redirectTo,
  });

  check("asking for an unknown address is accepted", unknown.status === 200, `got ${unknown.status}`);
  check(
    "and answers in exactly the words a real account gets",
    JSON.stringify(unknown.body) === JSON.stringify(known.body),
    `${JSON.stringify(unknown.body)} vs ${JSON.stringify(known.body)}`,
  );

  await sleep(400);
  check(
    "nothing is mailed to an address with no account",
    !outbox().slice(beforeGhost).some((mail) => mail.to === ghost),
  );

  const resetMail = await waitForMail(carolEmail, beforeReal, /reset/i);
  check("the real account gets a reset email", Boolean(resetMail));

  const hop = await anon.follow(linkIn(resetMail));
  const token = hop.location ? new URL(hop.location).searchParams.get("token") : null;
  check(
    "its link redirects to the app carrying a token",
    hop.status === 302 && (hop.location ?? "").startsWith(redirectTo) && Boolean(token),
    JSON.stringify(hop),
  );

  const short = await anon("POST", "/api/auth/reset-password", { newPassword: "short", token });
  check("a too-short new password is refused", short.status === 400, `got ${short.status}`);

  const reset = await anon("POST", "/api/auth/reset-password", { newPassword: NEW_PASSWORD, token });
  check("choosing a new password works", reset.status === 200, `got ${reset.status}`);

  const reuse = await anon("POST", "/api/auth/reset-password", {
    newPassword: "yet-another-passphrase",
    token,
  });
  check("the link works only once", reuse.status === 400, `got ${reuse.status}`);

  const oldLogin = await makeClient()("POST", "/api/auth/sign-in/email", {
    email: carolEmail,
    password: PASSWORD,
  });
  check("the old password no longer works", oldLogin.status === 401, `got ${oldLogin.status}`);

  const freshCarol = makeClient();
  const newLogin = await freshCarol("POST", "/api/auth/sign-in/email", {
    email: carolEmail,
    password: NEW_PASSWORD,
  });
  check("the new one does", newLogin.status === 200, `got ${newLogin.status}`);

  // A reset is often a response to a stolen password, so the login the thief
  // may be holding has to die with it.
  const stale = await carol("GET", "/api/accounts");
  check("every session from before the reset is ended", stale.status === 401, `got ${stale.status}`);

  // Reading the reset email proves the mailbox as well as a confirmation link
  // does, so an account that never confirmed does not have to as well.
  const dave = makeClient();
  const daveEmail = `dave+${stamp}@example.test`;
  const beforeDave = outbox().length;
  await dave("POST", "/api/auth/sign-up/email", {
    email: daveEmail,
    password: PASSWORD,
    name: "Dave",
    callbackURL: `${ORIGIN}/verify`,
  });
  await waitForMail(daveEmail, beforeDave, /confirm/i);

  const beforeDaveReset = outbox().length;
  await dave("POST", "/api/auth/request-password-reset", { email: daveEmail, redirectTo });
  const daveMail = await waitForMail(daveEmail, beforeDaveReset, /reset/i);
  const daveHop = await dave.follow(linkIn(daveMail));
  const daveToken = new URL(daveHop.location).searchParams.get("token");
  await dave("POST", "/api/auth/reset-password", { newPassword: NEW_PASSWORD, token: daveToken });

  const daveLogin = await dave("POST", "/api/auth/sign-in/email", {
    email: daveEmail,
    password: NEW_PASSWORD,
  });
  check(
    "resetting a password also confirms the address it was sent to",
    daveLogin.status === 200,
    `got ${daveLogin.status}`,
  );
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
  const attempt = await admin("POST", "/api/auth/sign-in/email", {
    email: adminEmail,
    password: PASSWORD,
  });
  if (attempt.status >= 400) {
    // Not there yet, or there and unconfirmed: go through the same door
    // everyone else does. If the account exists under some other password this
    // throws, and the check below reports the admin half as skipped.
    await signUp(admin, adminEmail).catch(() => undefined);
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
