/**
 * End-to-end smoke test.
 *
 * Runs the built app in a real Chrome against a running API, because the parts
 * most likely to break cannot be reached from Node: sign-up, the session
 * cookie travelling on every request, the first-run seed, and a full round trip
 * through the entry form.
 *
 * The API has to be up, and this origin has to be in its WEB_ORIGIN list -
 * otherwise the browser's own CORS check refuses every call, which is exactly
 * what it is there for.
 *
 *   npm run db:up && npm run dev -w @advantage/api   # in another terminal
 *   node e2e/smoke.mjs
 *   BASE_URL=http://localhost:5173 node e2e/smoke.mjs   # against `npm run dev`
 *   HEADLESS=false node e2e/smoke.mjs                   # watch it happen
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "..", "dist");
const SHOTS = path.join(HERE, "screenshots");

/**
 * The mail the API would have sent. In development nothing leaves the machine:
 * the API appends each message to this file, which is how a test can open the
 * link a real inbox would have received. See apps/api/src/mail/dev.ts for why
 * it is a file rather than a route.
 */
const OUTBOX = path.join(HERE, "..", "..", "..", ".mail", "outbox.jsonl");

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

/** The first message to `to` after position `since` whose subject matches, or null. */
async function waitForMail(to, since, subject) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = outbox()
      .slice(since)
      .find((mail) => mail.to === to.toLowerCase() && (!subject || subject.test(mail.subject)));
    if (found) return found;
    await pause(100);
  }
  return null;
}

/** The link in a message, from its plain-text body. */
const linkIn = (mail) => mail.text.split(/\s+/).find((word) => word.startsWith("http"));

/** What the stubbed fact service answers with, so the header line is assertable. */
const FACT = "A duck's quack does not echo, and no one knows why.";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".map": "application/json; charset=utf-8",
};

/** Static server with SPA fallback - enough to host a Vite build. */
function serve(root) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = path.join(root, decodeURIComponent(url.pathname));

    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = path.join(root, "index.html");
    }

    response.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(response);
  });

  // A fixed port on `localhost`, not a random one on `127.0.0.1`: the API only
  // accepts credentialed requests from the origins it was told about, and an
  // origin it has never heard of cannot be one of them.
  const port = Number(process.env.E2E_PORT ?? 4173);

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ url: `http://localhost:${port}`, close: () => server.close() });
    });
  });
}

const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

/**
 * Visible text, lowercased. `innerText` reflects text-transform, so labels the
 * design uppercases come back uppercased - comparisons have to ignore case.
 */
async function textOf(page) {
  const text = await page.evaluate(() => document.body.innerText);
  return text.toLowerCase();
}

function waitForText(page, needle, timeout = 30_000) {
  return page.waitForFunction(
    (value) => document.body.innerText.toLowerCase().includes(value),
    { timeout },
    needle.toLowerCase(),
  );
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Put a card in frame so a viewport screenshot captures it. */
async function scrollToHeading(page, title) {
  await page.evaluate((needle) => {
    const heading = [...document.querySelectorAll("h3")].find(
      (node) => node.textContent?.trim() === needle,
    );
    heading?.scrollIntoView({ block: "start" });
  }, title);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const scrollToOutlook = (page) => scrollToHeading(page, "Outlook");

function countBars(page) {
  return page.$$eval(".recharts-bar-rectangle path", (nodes) => nodes.length);
}

/**
 * Wait until the Outlook list is showing the timeframe now selected. The
 * caption is local state and the rows are a round trip, so they no longer
 * arrive together - counting too early counts the previous window.
 */
function waitForOutlook(page) {
  return page.waitForFunction(
    () => !document.body.innerText.toLowerCase().includes("working it out"),
    { timeout: 20_000 },
  );
}

/** How many rows the Outlook breakdown list is showing. */
function countOutlookItems(page) {
  return page.evaluate(
    () => document.querySelectorAll("[data-testid=outlook-entries] > li").length,
  );
}

/** The figure on the Net worth tile, as shown. */
function readNetWorth(page) {
  return page.evaluate(() => {
    const tile = [...document.querySelectorAll("div")].find((node) =>
      node.innerText?.startsWith("NET WORTH"),
    );
    if (!tile) return null;
    const match = tile.innerText.match(/[\d.,]+/g);
    return match ? match[0] : null;
  });
}

/**
 * Submit the open sheet and wait for it to close. Radix moves focus around as
 * the select closes, so a click can land a frame early; one retry absorbs that
 * without hiding a real validation failure, which is reported verbatim.
 */
async function submitSheet(page, label) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickText(page, "button", label);
    try {
      await page.waitForFunction(() => !document.querySelector("#amount"), { timeout: 4000 });
      return;
    } catch {
      await pause(300);
    }
  }

  const complaints = await page.evaluate(() => {
    const sheet = document.querySelector("[role=dialog]");
    return sheet ? sheet.innerText : "(no sheet on screen)";
  });
  throw new Error(`Sheet did not close after "${label}". Form said:
${complaints}`);
}

/**
 * Pick an option out of a Radix select. The listbox scrolls inside a clipped
 * viewport, so an option can be laid out outside it and a plain click lands on
 * whatever is painted on top. Scroll it into view first, and fall back to the
 * keyboard typeahead - which is also the path a keyboard user takes.
 */
async function selectOption(page, triggerSelector, text) {
  await page.click(triggerSelector);
  await page.waitForSelector("[role=option]", { timeout: 10_000 });

  const handle = await page.evaluateHandle((needle) => {
    const option = [...document.querySelectorAll("[role=option]")].find((node) =>
      node.textContent?.toLowerCase().includes(needle.toLowerCase()),
    );
    option?.scrollIntoView({ block: "center" });
    return option ?? null;
  }, text);

  const element = handle.asElement();
  if (element) {
    await pause(120);
    await element.click().catch(() => {});
  }

  const chosen = () =>
    page.evaluate(
      (selector, needle) =>
        document.querySelector(selector)?.textContent?.toLowerCase().includes(needle.toLowerCase()) ??
        false,
      triggerSelector,
      text,
    );

  if (await chosen()) return;

  await page.keyboard.type(text.slice(0, 12), { delay: 30 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (selector, needle) =>
      document.querySelector(selector)?.textContent?.toLowerCase().includes(needle.toLowerCase()) ??
      false,
    { timeout: 10_000 },
    triggerSelector,
    text,
  );
}

/**
 * Click the first element whose text matches. Scrolls it into view first: the
 * entry sheet scrolls, so a control can be laid out below the fold and Chrome
 * refuses to click what it cannot see.
 */
async function clickText(page, selector, text) {
  const handle = await page.evaluateHandle(
    (sel, needle) => {
      const node = [...document.querySelectorAll(sel)].find((candidate) =>
        candidate.textContent?.trim().toLowerCase().includes(needle.toLowerCase()),
      );
      node?.scrollIntoView({ block: "center" });
      return node ?? null;
    },
    selector,
    text,
  );

  const element = handle.asElement();
  if (!element) throw new Error(`No ${selector} matching "${text}"`);
  await pause(80);
  await element.click();
}

async function main() {
  const executablePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!executablePath) {
    console.error("No Chrome or Edge found. Set CHROME_PATH.");
    process.exit(2);
  }

  const base = process.env.BASE_URL;
  const hosted = base ? null : await serve(DIST);
  const target = base ?? hosted.url;
  console.log(`\nTesting ${target}\n`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: process.env.HEADLESS === "false" ? false : true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  /**
   * The header fact comes from uselessfacts.jsph.pl. Serve it here rather than
   * reaching across the internet for it: a suite that goes red because someone
   * else's server is down teaches people to ignore red, and a canned answer
   * also makes the line assertable.
   */
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (!request.url().includes("uselessfacts")) {
      void request.continue();
      return;
    }
    void request.respond({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ text: FACT }),
    });
  });

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    await page.goto(target, { waitUntil: "networkidle2", timeout: 60_000 });

    // 1. Nothing is reachable without a session; sign up, and the first-run
    //    seed lands behind it.
    await page.waitForSelector("#auth-email", { timeout: 30_000 });
    check("an unauthenticated visit lands on sign-in", page.url().includes("/signin"));

    const email = `smoke+${Date.now()}@example.test`;
    check("sign-in has no confirmation field", (await page.$("#auth-confirm")) === null);
    await clickText(page, "a", "Create an account");
    await page.waitForSelector("#auth-name", { timeout: 10_000 });
    await page.type("#auth-name", "Smoke Test");
    await page.type("#auth-email", email);

    // The form asks twice, and says what is wrong before anything is sent.
    check("sign-up asks for the password a second time", (await page.$("#auth-confirm")) !== null);

    const replace = async (selector, value) => {
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press("Backspace");
      if (value) await page.type(selector, value);
    };

    await page.type("#auth-password", "short");
    await page.type("#auth-confirm", "different");
    await clickText(page, "button", "Create account");
    let shown = await textOf(page);
    check("a short password is refused with the reason", shown.includes("must be at least 8 characters"));
    check("a mismatch is refused with the reason", shown.includes("passwords do not match"));
    check("neither reaches the server", page.url().includes("/signup"));
    check(
      "the offending fields are marked invalid",
      await page.evaluate(
        () =>
          document.querySelector("#auth-password")?.getAttribute("aria-invalid") === "true" &&
          document.querySelector("#auth-confirm")?.getAttribute("aria-invalid") === "true",
      ),
    );

    // Long enough now, but the two still disagree: only the mismatch remains.
    await replace("#auth-password", "correct-horse-battery");
    await replace("#auth-confirm", "correct-horse-batterx");
    await clickText(page, "button", "Create account");
    shown = await textOf(page);
    check("a long enough password drops the length error", !shown.includes("must be at least 8 characters"));
    check("a near-miss confirmation is still a mismatch", shown.includes("passwords do not match"));
    check("and still nothing is sent", page.url().includes("/signup"));

    // Fixing it clears the message and lets the form through.
    await replace("#auth-confirm", "correct-horse-battery");
    check("matching passwords clear the error", !(await textOf(page)).includes("passwords do not match"));
    const mailBefore = outbox().length;
    await clickText(page, "button", "Create account");

    // Sign-up no longer signs anyone in: it asks them to open a link first.
    await waitForText(page, "check your email", 30_000);

    // The session is re-read right after a sign-up. That used to swap the page
    // for a blank splash and back, which threw this screen away a moment after
    // it appeared - so give it time to happen, then look again.
    await pause(2000);
    shown = await textOf(page);
    check("and the panel stays up once the session refresh settles", shown.includes("check your email"), shown.slice(0, 120));
    check("signing up asks for the email to be confirmed", true);
    check("and says which address the link went to", shown.includes(email), shown.slice(0, 260));
    check("with a resend that waits before it will fire again", shown.includes("send it again"), shown.slice(0, 260));
    check("and no dashboard yet", !shown.includes("net worth"));

    const firstMail = await waitForMail(email, mailBefore, /confirm/i);
    check("a confirmation email was sent", Boolean(firstMail));

    // Trying to sign in before confirming is refused, says why, and mails a
    // fresh link. The refusal is a 403, which Chrome reports as a console error
    // of its own, so it is claimed here rather than left to fail the run.
    await page.goto(`${target}/signin`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#auth-email", { timeout: 15_000 });
    await page.type("#auth-email", email);
    await page.type("#auth-password", "correct-horse-battery");

    const refusalMark = consoleErrors.length;
    const beforeRetry = outbox().length;
    await clickText(page, "button", "Sign in");
    await waitForText(page, "confirm your email first", 30_000);
    check("signing in before confirming is stopped with an explanation", true);

    const refused = consoleErrors.splice(refusalMark).filter((message) => message.includes("403"));
    check("by a 403 from the server", refused.length >= 1, "no 403 was logged");

    const freshMail = await waitForMail(email, beforeRetry, /confirm/i);
    check("and a fresh link is sent", Boolean(freshMail));

    // A link that has been tampered with lands on a page that says so and
    // offers another, rather than on a blank screen or the dashboard.
    await page.goto(linkIn(freshMail).replace("token=", "token=x"), { waitUntil: "networkidle2" });
    await waitForText(page, "that link did not work", 30_000);
    check("a broken confirmation link explains itself", page.url().includes("/verify"));
    check(
      "and offers to send another",
      (await textOf(page)).includes("send a new link"),
    );

    // The real one confirms the address, signs the person in, and drops them
    // in the app - no second password prompt.
    await page.goto(linkIn(freshMail), { waitUntil: "networkidle2" });
    await waitForText(page, "net worth", 60_000);
    check("opening the real link confirms the address and signs in", true);
    check("and lands in the app, not on the API", !page.url().includes(":4000"), page.url());
    check("signing up seeds a ledger and renders the dashboard", true);
    check("the session shows who is signed in", (await textOf(page)).includes(email));

    // The cards fill from separate requests now, so the frame arriving is not
    // the same event as the figures arriving. Wait for the data itself.
    await waitForText(page, "electricity", 30_000);
    const body = await textOf(page);
    check("seeded planned payments show up", body.includes("electricity"));
    check("the generic income source is listed", body.includes("salary"));
    check("and no one else's employer is", !body.includes("mentis") && !body.includes("live luxe"));
    check("dark graphite background", (await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    )) === "rgb(22, 24, 27)");
    check("lime accent is applied", (await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return styles.getPropertyValue("--primary").trim();
    })) === "#a3e635");

    const headerFact = await page.evaluate(
      () =>
        [...document.querySelectorAll("header p")].find((node) =>
          node.innerText.includes("duck"),
        )?.innerText ?? null,
    );
    check("the header carries a fact", headerFact === FACT, headerFact);

    await page.screenshot({ path: path.join(SHOTS, "01-dashboard-empty.png") });

    // 1b. A new account holds cash alone. The rest come from the shared
    //     catalog, which is also where the artwork lives now.
    await page.goto(`${target}/accounts`, { waitUntil: "networkidle2" });
    await waitForText(page, "net worth", 20_000);

    const startingWallets = await page.$$eval("img[alt], span", () => 0);
    void startingWallets;
    check(
      "a new account starts with cash alone",
      (await textOf(page)).includes("cash") && !(await textOf(page)).includes("maribank"),
    );

    for (const wanted of ["Maribank", "GCash"]) {
      await clickText(page, "button", "Add account");
      await page.waitForFunction(
        () => document.body.innerText.includes("Pick one of the accounts we know about"),
        { timeout: 15_000 },
      );

      if (wanted === "Maribank") {
        // The marks are fetched from the API, so the dialog's text arrives
        // before its images do - wait for them to decode rather than counting
        // whatever happens to be ready.
        await page
          .waitForFunction(
            () =>
              [...document.querySelectorAll("[role=dialog] img")].filter(
                (node) => node.complete && node.naturalWidth > 0,
              ).length >= 3,
            { timeout: 15_000 },
          )
          .catch(() => {});

        const marks = await page.$$eval("[role=dialog] img", (nodes) =>
          nodes.filter((node) => node.naturalWidth > 0).length,
        );
        check("the catalog offers accounts with real logos", marks >= 3, `${marks} logos loaded`);
        await page.screenshot({ path: path.join(SHOTS, "01b-account-catalog.png") });
      }

      await clickText(page, "[role=dialog] button", wanted);
      await waitForText(page, wanted, 15_000);
    }

    await page.goto(`${target}/accounts`, { waitUntil: "networkidle2" });
    await waitForText(page, "maribank", 20_000);
    const walletsAfter = await textOf(page);
    check("adding from the catalog works", walletsAfter.includes("maribank") && walletsAfter.includes("gcash"));

    await page.goto(`${target}/`, { waitUntil: "networkidle2" });
    await waitForText(page, "electricity", 30_000);

    // 2. Log an expense through the real form.
    await clickText(page, "button", "New record");
    await page.waitForSelector("#amount", { timeout: 10_000 });
    await page.type("#amount", "2500.00");
    await selectOption(page, "#category", "Buy Now Pay Later");
    check("category picker selects a subcategory", true);
    await page.type("#payee", "Installment");
    await page.screenshot({ path: path.join(SHOTS, "02-expense-form.png") });

    await submitSheet(page, "Add record");
    await waitForText(page, "installment", 15_000);
    check("an expense saves and appears on the dashboard", true);

    // The breakdown legend is drawn by Recharts once it has measured its
    // container, a frame or two after the figures land.
    await waitForText(page, "loans & installments", 15_000);
    const afterExpense = await textOf(page);
    check("expense total picks it up", afterExpense.includes("2,500.00"));
    check("the breakdown names the group", afterExpense.includes("loans & installments"));
    await page.screenshot({ path: path.join(SHOTS, "03-dashboard-with-expense.png") });

    // 3. Log income. The picker offers whoever this person says pays them.
    await clickText(page, "button", "New record");
    await page.waitForSelector("#amount", { timeout: 10_000 });
    await clickText(page, "button", "Income");
    await page.waitForSelector("[role=radio]", { timeout: 10_000 });

    const sourceCards = await page.$$eval("[role=radiogroup][aria-label='Income source'] [role=radio]", (nodes) =>
      nodes.map((node) => node.innerText.split("\n")[0]),
    );
    check("the income picker offers the seeded source", sourceCards.length === 1, sourceCards.join(" / "));

    const logos = await page.$$eval(
      "[role=radiogroup][aria-label='Income source'] img",
      (nodes) => nodes.length,
    );
    // Text only: no image anywhere in the picker, by design.
    check("and carries no logos at all", logos === 0, `${logos} images`);

    await clickText(page, "[role=radio]", "Salary");
    await page.type("#amount", "30000");
    await page.screenshot({ path: path.join(SHOTS, "04-income-form.png") });

    await submitSheet(page, "Add record");
    await waitForText(page, "30,000.00", 15_000);
    check("income saves against its source", true);

    // 4. The charts actually draw marks, in the right direction.
    const bars = await page.$$eval("svg .recharts-bar-rectangle", (nodes) => nodes.length);
    check("cash flow chart drew bars", bars > 0, `${bars} bars`);

    // Recharts grows the bars over ~1.5s; measuring mid-flight reads nonsense.
    await pause(1800);

    const geometry = await page.evaluate(() => {
      const zero = document.querySelector(".recharts-reference-line line");
      const baseline = zero ? zero.getBoundingClientRect().top : null;
      const marks = [...document.querySelectorAll(".recharts-bar-rectangle path")].map((node) => {
        const box = node.getBoundingClientRect();
        return {
          fill: getComputedStyle(node).fill,
          top: box.top,
          bottom: box.bottom,
          height: box.height,
        };
      });
      return { baseline, marks };
    });

    const { baseline, marks } = geometry;
    const income = marks.find((mark) => mark.fill === "rgb(106, 148, 20)");
    const spending = marks.find((mark) => mark.fill === "rgb(230, 103, 103)");

    check(
      "income bar sits above the zero line",
      Boolean(income && baseline && income.top < baseline && income.bottom <= baseline + 2),
      income ? `top=${Math.round(income.top)} baseline=${Math.round(baseline)}` : "no income bar",
    );
    check(
      "spending bar hangs below the zero line",
      Boolean(spending && baseline && spending.bottom > baseline && spending.top >= baseline - 2),
      spending
        ? `bottom=${Math.round(spending.bottom)} baseline=${Math.round(baseline)}`
        : "no spending bar",
    );
    check(
      "income bar is taller than the smaller spending bar",
      Boolean(income && spending && income.height > spending.height),
      income && spending ? `${Math.round(income.height)}px vs ${Math.round(spending.height)}px` : "",
    );
    await page.screenshot({ path: path.join(SHOTS, "05-dashboard-full.png"), fullPage: true });

    // 5. Every route renders.
    for (const [route, marker] of [
      ["transactions", "Transactions"],
      ["budgets", "Budgets"],
      ["planned", "Planned payments"],
      ["accounts", "Net worth"],
      ["categories", "Categories"],
      ["settings", "Your data"],
    ]) {
      await page.goto(`${target}/${route}`, { waitUntil: "networkidle2" });
      await waitForText(page, marker);
      check(`/${route} renders`, true);
      await page.screenshot({ path: path.join(SHOTS, `06-${route}.png`), fullPage: true });
    }

    // 6. Budgets: set one through the UI and read the verdict back.
    await page.goto(`${target}/budgets`, { waitUntil: "networkidle2" });
    await waitForText(page, "no budgets yet", 30_000);
    await clickText(page, "button", "Set a budget");
    await page.waitForSelector("[role=dialog]", { timeout: 10_000 });

    await page.$eval("[role=dialog] input#amount", (node) => node.focus());
    await page.keyboard.type("2000");
    await clickText(page, "button", "Save budget");
    await page.waitForFunction(() => !document.querySelector("[role=dialog]"), { timeout: 15_000 });

    await waitForText(page, "budgeted", 15_000);
    const budgets = await textOf(page);
    check("an overall budget saves and is measured", budgets.includes("everything"));
    check(
      "the budget verdict calls out the overspend",
      budgets.includes("over by") || budgets.includes("overspend"),
      "spent 2,500.00 of a 2,000 limit",
    );
    await page.screenshot({ path: path.join(SHOTS, "07-budgets.png"), fullPage: true });

    // 7. Import the real plan file and check it lands in Planned, not in the ledger.
    const planFile = path.join(HERE, "..", "..", "..", "data", "example-plan.json");
    if (existsSync(planFile)) {
      await page.goto(`${target}/`, { waitUntil: "networkidle2" });
      await waitForText(page, "net worth", 30_000);
      const worthBefore = await readNetWorth(page);

      await page.goto(`${target}/settings`, { waitUntil: "networkidle2" });
      await waitForText(page, "your data", 30_000);
      const upload = await page.$("input[type=file]");
      await upload.uploadFile(planFile);
      await waitForText(page, "planned items", 30_000);

      const report = await textOf(page);
      check("the plan file imports", report.includes("loaded 7 planned items"), report.match(/loaded [^.]*/)?.[0] ?? "");
      check("it says nothing counts until logged", report.includes("until you log it"));

      await page.goto(`${target}/planned`, { waitUntil: "networkidle2" });
      await waitForText(page, "planned payments", 30_000);
      const planned = await textOf(page);
      check("the planned purchase is scheduled", planned.includes("laptop"));
      check("the weekly pay is scheduled", planned.includes("weekly pay"));
      check("the one-off installment is scheduled", planned.includes("installment"));
      // A 10,000 weekly payout annualises to 43,333.33, plus the 25,000 monthly.
      check(
        "recurring income is annualised to a month",
        planned.includes("68,333"),
        planned.slice(planned.indexOf("recurring income"), planned.indexOf("recurring income") + 60),
      );
      await page.screenshot({ path: path.join(SHOTS, "09-planned-with-plan.png"), fullPage: true });

      await page.goto(`${target}/`, { waitUntil: "networkidle2" });
      await waitForText(page, "net worth", 30_000);
      const worthAfter = await readNetWorth(page);
      check(
        "importing a plan does not move net worth",
        worthBefore === worthAfter,
        `${worthBefore} -> ${worthAfter}`,
      );
      await page.screenshot({ path: path.join(SHOTS, "10-dashboard-after-plan.png"), fullPage: true });
    }

    // 7a. Wallet: balances per account, and the month's movement through each.
    await page.goto(`${target}/`, { waitUntil: "networkidle2" });
    await waitForText(page, "wallet", 30_000);

    // By now the plan file has been imported, and it carries an accounts block -
    // so the wallet holds what was added from the catalog plus what the plan
    // brought with it.
    const walletText = await textOf(page);
    check(
      "the wallet holds every account in play",
      ["cash", "maribank", "unionbank", "gcash", "wise"].every((name) =>
        walletText.includes(name),
      ),
    );
    check("wallet shows balance and spending", 
      walletText.includes("balance") && walletText.includes("spent in"));

    const walletRows = await page.$$eval(
      "[data-testid=wallet-accounts] > li",
      (nodes) => nodes.length,
    );
    check("all accounts are listed by default", walletRows === 5, `${walletRows} rows`);

    // Every account mark is drawn in the same box, whatever its source image.
    const iconBoxes = await page.$$eval("[data-testid=wallet-accounts] img", (nodes) =>
      nodes.map((node) => `${Math.round(node.clientWidth)}x${Math.round(node.clientHeight)}`),
    );
    check(
      "account icons render at a uniform size",
      iconBoxes.length >= 3 && new Set(iconBoxes).size === 1,
      `${iconBoxes.length} logos, sizes: ${[...new Set(iconBoxes)].join(", ")}`,
    );
    check("the icons actually loaded", 
      await page.$$eval("[data-testid=wallet-accounts] img", 
        (nodes) => nodes.every((node) => node.naturalWidth > 0)));

    // Clicking an account opens its card over the widget; Escape closes it.
    await clickText(page, "[data-testid=wallet-accounts] button", "GCash");
    await page.waitForFunction(
      () => Boolean(document.querySelector("[data-testid=wallet-detail]")),
      { timeout: 10_000 },
    );
    await pause(600);
    const popupText = await page.$eval("[data-testid=wallet-detail]", (node) =>
      node.textContent.toLowerCase(),
    );
    check(
      "the account card shows its own cash flow and breakdown",
      popupText.includes("gcash") &&
        popupText.includes("cash flow") &&
        popupText.includes("money in") &&
        popupText.includes("money out"),
    );
    await scrollToHeading(page, "Wallet");
    await page.screenshot({ path: path.join(SHOTS, "14-wallet-account.png") });

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector("[data-testid=wallet-detail]"),
      { timeout: 10_000 },
    );
    check("escape closes the account card", true);
    await scrollToHeading(page, "Wallet");
    await pause(400);
    await page.screenshot({ path: path.join(SHOTS, "15-wallet-all.png") });

    // Interactive controls take a pointer cursor, set once in the base layer.
    const cursors = await page.evaluate(() => {
      const pick = (selector) => {
        const node = [...document.querySelectorAll(selector)].find(
          (candidate) => !candidate.disabled && candidate.offsetParent !== null,
        );
        return node ? getComputedStyle(node).cursor : "none";
      };
      return {
        button: pick("button:not(:disabled)"),
        radio: pick("[role=radio]"),
        tab: pick("[role=tab]"),
        link: pick("a[href]"),
        disabled: (() => {
          const node = document.querySelector("button:disabled");
          return node ? getComputedStyle(node).cursor : "n/a";
        })(),
      };
    });
    check(
      "interactive controls show a pointer",
      ["button", "radio", "tab", "link"].every((key) => cursors[key] === "pointer"),
      JSON.stringify(cursors),
    );
    // Some disabled controls opt into `default` on purpose - the month label
    // when it is already the current month is not forbidden, just inert. What
    // matters is that nothing disabled still invites a click.
    check(
      "disabled controls do not invite a click",
      cursors.disabled !== "pointer",
      cursors.disabled,
    );

    // 7b. Outlook: the forward view built from records plus the schedule.
    await page.goto(`${target}/`, { waitUntil: "networkidle2" });
    await waitForText(page, "balance forecast", 30_000);
    await waitForText(page, "expected income", 20_000);

    const outlookText = await textOf(page);
    check("outlook renders its three metrics", 
      outlookText.includes("expected income") &&
      outlookText.includes("expected spending") &&
      outlookText.includes("ending balance"));
    check(
      "outlook defaults to a six-month range",
      outlookText.includes("september 2026 to february 2027"),
      outlookText.slice(outlookText.indexOf("projected from"), outlookText.indexOf("projected from") + 90),
    );
    check("the list marks planned apart from logged", 
      outlookText.includes("planned") && outlookText.includes("logged"));
    check("the planned purchase shows up in the window", outlookText.includes("laptop"));

    await waitForOutlook(page);
    const rangeItems = await countOutlookItems(page);
    check("the range lists the scheduled items", rangeItems > 10, `${rangeItems} items`);

    await scrollToOutlook(page);
    await pause(1800);
    const rangeBars = await countBars(page);
    check("the outlook chart draws bars", rangeBars > 4, `${rangeBars} bars across both charts`);
    await page.screenshot({ path: path.join(SHOTS, "11-outlook-range.png") });

    // Year view: same module, wider span, monthly buckets.
    await clickText(page, "button", "Year");
    await waitForText(page, "2026, month by month", 20_000);
    await waitForOutlook(page);
    const yearItems = await countOutlookItems(page);
    check("switching to Year re-scopes the list", yearItems !== rangeItems, `${yearItems} items`);

    await scrollToOutlook(page);
    await pause(1800);
    const yearGeometry = await page.evaluate(() => {
      const svg = [...document.querySelectorAll(".recharts-wrapper")].pop();
      const box = svg?.getBoundingClientRect();
      return {
        width: Math.round(box?.width ?? 0),
        height: Math.round(box?.height ?? 0),
        bars: document.querySelectorAll(".recharts-bar-rectangle path").length,
        ticks: document.querySelectorAll(".recharts-cartesian-axis-tick").length,
      };
    });
    check(
      "the year chart has a measured plot area",
      yearGeometry.width > 200 && yearGeometry.height > 100,
      `${yearGeometry.width}x${yearGeometry.height}`,
    );
    check("the year chart draws bars", yearGeometry.bars > 4, `${yearGeometry.bars} bars`);

    await page.screenshot({ path: path.join(SHOTS, "12-outlook-year.png") });

    // Month view: follows the month selector, day-level buckets. The caption
    // is local state and the rows are a round trip, so waiting for the caption
    // is not waiting for the list - wait for the window to stop saying it is
    // still working it out.
    await clickText(page, "button", "Month");
    await waitForText(page, "day by day", 20_000);
    await waitForOutlook(page);
    const monthItems = await countOutlookItems(page);
    check("switching to Month narrows the list", monthItems < yearItems, `${monthItems} items`);
    check(
      "the month view buckets by day",
      (await textOf(page)).includes("september 2026, day by day"),
    );

    await scrollToOutlook(page);
    await pause(1800);
    const monthBars = await countBars(page);
    check("the day-by-day view draws bars too", monthBars > 2, `${monthBars} bars`);
    await page.screenshot({ path: path.join(SHOTS, "13-outlook-month.png") });

    // 8. Light mode is a selected theme, not an automatic inversion.
    await clickText(page, "button", "Toggle theme");
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("dark"),
      { timeout: 10_000 },
    );
    const light = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    }));
    check("light theme repaints the surface", light.background === "rgb(246, 247, 246)", light.background);
    check("light theme uses its own darker accent", light.primary === "#4d7c0f", light.primary);

    // The rail stays dark in both themes, so its accent must not follow --primary.
    const railAccent = await page.evaluate(() => {
      const active = document.querySelector("aside a[aria-current=page]");
      return active ? getComputedStyle(active).color : null;
    });
    check(
      "the dark sidebar keeps a readable accent in light mode",
      railAccent === "rgb(163, 230, 53)",
      String(railAccent),
    );
    await page.screenshot({ path: path.join(SHOTS, "08-light-theme.png"), fullPage: true });

    await clickText(page, "button", "Toggle theme");
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"), {
      timeout: 10_000,
    });

    // 9. The session and the records both survive a reload. The records are on
    //    the server, so this is really asking whether the cookie came back.
    await page.goto(target, { waitUntil: "networkidle2" });
    await waitForText(page, "net worth", 60_000);
    const reloaded = await textOf(page);
    check("the session survives a reload", !page.url().includes("/signin"));
    check("records survive a reload", reloaded.includes("installment"));

    // 9b. There are two apps behind the sign-in and an account is in exactly
    //     one. This one is not in ADMIN_EMAILS, so it is in the personal app.
    check("a normal user gets no Admin nav item", !(await textOf(page)).includes("admin"));

    await page.goto(`${target}/admin`, { waitUntil: "networkidle2" });
    await waitForText(page, "net worth", 20_000);
    check(
      "and is sent back to their own dashboard from /admin",
      !(await textOf(page)).includes("account catalog"),
      page.url(),
    );

    // 9c. The narrow layout. A page wider than the viewport is the failure
    //     that actually happens - one control group that will not wrap pushes
    //     the whole document sideways, and it is invisible at desktop width.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });

    for (const route of ["/", "/transactions", "/budgets", "/planned", "/accounts", "/settings"]) {
      await page.goto(`${target}${route}`, { waitUntil: "networkidle2" });
      await pause(1200);

      const width = await page.evaluate(() => ({
        doc: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));

      check(
        `${route} does not scroll sideways on a phone`,
        width.scroll <= width.doc + 1,
        `${width.scroll} wide in ${width.doc}`,
      );
    }

    // The rail is hidden and the strip takes over below the large breakpoint.
    // There are two navs in the document - select the one under test.
    const narrowChrome = await page.evaluate(() => {
      const nav = document.querySelector("[data-testid=mobile-nav]");
      const aside = document.querySelector("aside");
      return {
        navVisible: Boolean(nav && nav.getBoundingClientRect().height > 0),
        railVisible: Boolean(aside && aside.getBoundingClientRect().width > 0),
      };
    });
    check(
      "the nav strip replaces the rail on a phone",
      narrowChrome.navVisible && !narrowChrome.railVisible,
      JSON.stringify(narrowChrome),
    );

    /**
     * The strip follows the theme rather than staying dark. A dark band wedged
     * between a white header and a white page reads as something that failed
     * to load, which is the bug this is here to keep fixed.
     */
    const navLuminance = () =>
      page.evaluate(() => {
        const nav = document.querySelector("[data-testid=mobile-nav]");
        const [r, g, b] = (getComputedStyle(nav).backgroundColor.match(/[0-9.]+/g) ?? [])
          .slice(0, 3)
          .map(Number);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      });

    const setTheme = async (wanted) => {
      const now = await page.evaluate(() =>
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
      if (now === wanted) return;
      await clickText(page, "button", "Toggle theme");
      await page.waitForFunction(
        (w) => document.documentElement.classList.contains("dark") === (w === "dark"),
        { timeout: 10_000 },
        wanted,
      );
      await pause(250);
    };

    await setTheme("light");
    const navLight = await navLuminance();
    check("the nav strip is light in light mode", navLight > 0.8, `luminance ${navLight.toFixed(2)}`);

    await setTheme("dark");
    const navDark = await navLuminance();
    check("and graphite in dark mode", navDark < 0.25, `luminance ${navDark.toFixed(2)}`);

    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${target}/`, { waitUntil: "networkidle2" });
    await waitForText(page, "net worth", 20_000);

    // 10. Signing out ends it, and the app goes back behind the gate.
    await clickText(page, "button", "Sign out");
    await page.waitForFunction(() => location.pathname.includes("/signin"), { timeout: 15_000 });
    check("signing out returns to sign-in", true);

    await page.goto(`${target}/transactions`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#auth-email", { timeout: 15_000 });
    check("a signed-out visit cannot reach a screen", page.url().includes("/signin"));

    // 11. Forgot password, from the sign-in page to signing in with the new one.
    const NEW_PASSWORD = "a-brand-new-passphrase";
    await clickText(page, "a", "Forgot password?");
    await page.waitForSelector("#forgot-email", { timeout: 15_000 });
    check("sign-in links to forgot password", page.url().includes("/forgot-password"));

    await page.type("#forgot-email", email);
    const beforeReset = outbox().length;
    await clickText(page, "button", "Send reset link");
    await waitForText(page, "if an account exists", 30_000);
    check("asking for a link answers without confirming the account exists", true);

    const resetMail = await waitForMail(email, beforeReset, /reset/i);
    check("the reset email arrives", Boolean(resetMail));

    await page.goto(linkIn(resetMail), { waitUntil: "networkidle2" });
    await page.waitForSelector("#reset-password", { timeout: 30_000 });
    check("its link opens the reset form in the app", page.url().includes("/reset-password?token="), page.url());

    await page.type("#reset-password", "short");
    await page.type("#reset-confirm", "different");
    await clickText(page, "button", "Update password");
    shown = await textOf(page);
    check("the reset form applies the same length rule", shown.includes("must be at least 8 characters"));
    check("and the same match rule", shown.includes("passwords do not match"));

    await replace("#reset-password", NEW_PASSWORD);
    await replace("#reset-confirm", NEW_PASSWORD);
    await clickText(page, "button", "Update password");
    await waitForText(page, "password updated", 30_000);
    check("matching passwords update it", true);

    // Single use: the same link, opened again, is dead.
    await page.goto(linkIn(resetMail), { waitUntil: "networkidle2" });
    await waitForText(page, "that link has expired", 30_000);
    check("the reset link works only once", true);

    // The old password stops working; the new one signs in. The refusal is a
    // 401, claimed for the same reason as the 403 above.
    await page.goto(`${target}/signin`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#auth-email", { timeout: 15_000 });
    await page.type("#auth-email", email);
    await page.type("#auth-password", "correct-horse-battery");

    const oldMark = consoleErrors.length;
    await clickText(page, "button", "Sign in");
    await waitForText(page, "invalid email or password", 30_000);
    const rejected = consoleErrors.splice(oldMark).filter((message) => message.includes("401"));
    check("the old password is refused", rejected.length >= 1, "no 401 was logged");

    await replace("#auth-password", NEW_PASSWORD);
    await clickText(page, "button", "Sign in");
    await waitForText(page, "net worth", 60_000);
    check("the new password signs in", true);

    const realErrors = consoleErrors.filter(
      (message) => !message.includes("favicon") && !message.includes("sourcemap"),
    );
    check("no console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    hosted?.close();
  }

  const failed = checks.filter((entry) => !entry.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  console.log(`Screenshots in ${SHOTS}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSmoke test crashed:", error);
  process.exit(1);
});
