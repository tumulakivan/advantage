/**
 * End-to-end smoke test.
 *
 * Runs the built app in a real Chrome, because the parts most likely to break
 * cannot be reached from Node: the SQLite worker, the OPFS storage handshake,
 * migrations, the seed, and a full round trip through the entry form. Point it
 * at an already-running server with BASE_URL, or let it serve ./dist itself.
 *
 *   node e2e/smoke.mjs
 *   BASE_URL=http://localhost:5173 node e2e/smoke.mjs   # against `npm run dev`
 *   HEADLESS=false node e2e/smoke.mjs                   # watch it happen
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "..", "dist");
const SHOTS = path.join(HERE, "screenshots");

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

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
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

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    await page.goto(target, { waitUntil: "networkidle2", timeout: 60_000 });

    // 1. The database opens, migrates and seeds, then the shell renders.
    await waitForText(page, "net worth", 60_000);
    check("database opens and the dashboard renders", true);

    const storage = (await textOf(page)).includes("in memory only") ? "memory" : "opfs";
    check("persistent OPFS storage", storage === "opfs", `storage=${storage}`);

    const body = await textOf(page);
    check("seeded planned payments show up", body.includes("electricity"));
    check(
      "both income sources are listed",
      body.includes("mentis") && body.includes("live luxe"),
    );
    check("dark graphite background", (await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    )) === "rgb(22, 24, 27)");
    check("lime accent is applied", (await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return styles.getPropertyValue("--primary").trim();
    })) === "#a3e635");

    await page.screenshot({ path: path.join(SHOTS, "01-dashboard-empty.png") });

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

    const afterExpense = await textOf(page);
    check("expense total picks it up", afterExpense.includes("2,500.00"));
    check("the breakdown names the group", afterExpense.includes("loans & installments"));
    await page.screenshot({ path: path.join(SHOTS, "03-dashboard-with-expense.png") });

    // 3. Log income, which must offer the two businesses.
    await clickText(page, "button", "New record");
    await page.waitForSelector("#amount", { timeout: 10_000 });
    await clickText(page, "button", "Income");
    await page.waitForSelector("[role=radio]", { timeout: 10_000 });

    const sourceCards = await page.$$eval("[role=radiogroup][aria-label='Income source'] [role=radio]", (nodes) =>
      nodes.map((node) => node.innerText.split("\n")[0]),
    );
    check("income form offers exactly the two businesses", sourceCards.length === 2, sourceCards.join(" / "));

    const logos = await page.$$eval(
      "[role=radiogroup][aria-label='Income source'] img",
      (nodes) => nodes.map((node) => node.naturalWidth > 0),
    );
    check("both logos load", logos.length === 2 && logos.every(Boolean));

    await clickText(page, "[role=radio]", "Live Luxe");
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
      ["settings", "Data and storage"],
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
      await waitForText(page, "data and storage", 30_000);
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

    const walletText = await textOf(page);
    check(
      "wallet seeds the five real accounts",
      ["maribank", "unionbank", "gcash", "wise", "cash"].every((name) =>
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

    // Selecting one account narrows the module to that account.
    await clickText(page, "[role=radio]", "GCash");
    await page.waitForFunction(
      () => Boolean(document.querySelector("[data-testid=wallet-detail]")),
      { timeout: 10_000 },
    );
    check("selecting an account switches to its own activity", true);
    await scrollToHeading(page, "Wallet");
    await pause(400);
    await page.screenshot({ path: path.join(SHOTS, "14-wallet-account.png") });

    await clickText(page, "[role=radio]", "All accounts");
    await page.waitForFunction(
      () => Boolean(document.querySelector("[data-testid=wallet-accounts]")),
      { timeout: 10_000 },
    );
    check("switching back shows every account again", true);
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
    await waitForText(page, "outlook", 30_000);
    await waitForText(page, "expected income", 20_000);

    const outlookText = await textOf(page);
    check("outlook renders its three metrics", 
      outlookText.includes("expected income") &&
      outlookText.includes("expected spending") &&
      outlookText.includes("projected net"));
    check(
      "outlook defaults to a six-month range",
      outlookText.includes("september 2026 to february 2027"),
      outlookText.slice(outlookText.indexOf("projected from"), outlookText.indexOf("projected from") + 90),
    );
    check("the list marks planned apart from logged", 
      outlookText.includes("planned") && outlookText.includes("logged"));
    check("the planned purchase shows up in the window", outlookText.includes("laptop"));

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

    // Month view: follows the month selector, day-level buckets.
    await clickText(page, "button", "Month");
    await waitForText(page, "day by day", 20_000);
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

    // 9. Data survives a reload, which is the whole point of OPFS.
    await page.goto(target, { waitUntil: "networkidle2" });
    await waitForText(page, "net worth", 60_000);
    const reloaded = await textOf(page);
    check(
      "records survive a reload",
      reloaded.includes("installment"),
      storage === "opfs" ? "" : "in-memory fallback, not expected to persist",
    );

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
