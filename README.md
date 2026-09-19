# adVantage

A personal budget tracker that runs entirely in the browser. SQLite compiled to
WebAssembly holds the data, in a worker, in your own browser storage — there is
no server, no account, and nothing leaves the machine.

Built because [Wallet by BudgetBakers](https://budgetbakers.com/en/products/wallet/features/)
charges a subscription for a spreadsheet replacement.

```bash
npm install
npm run dev          # http://localhost:5173
```

## What it does today

| Screen | What it is for |
| --- | --- |
| **Dashboard** | Income, spending, net saved and net worth for the month; six-month cash flow; spending by group; **Wallet**; **Outlook**; income split by business; what is due next; budget progress; biggest expenses. |
| **Transactions** | Every record, grouped by day with a day total. Filter by type, account, category or free text, over one month or all time. |
| **Budgets** | A monthly ceiling per group (or one overall). Shows what is spent, what is left, and whether the *pace* lands over the line before month end. |
| **Planned** | The recurring side: bills, installments and the two monthly payouts. One tap turns a due item into a real record, and Undo takes it back out. |
| **Accounts** | Maribank, UnionBank, GCash, Wise and Cash out of the box, each with its own mark. Add more as you open them. Balances are derived from records, never typed in. |
| **Categories** | Seven expense groups, each owning one chart color, with subcategories beneath. |
| **Settings** | Currency and number format, theme, income source names, and the data tools: JSON backup, raw `.sqlite3` download, import, erase. |

Adding an expense asks for a category (groups and subcategories in one picker).
Adding income asks which business it came from — **Mentis Global** or
**Live Luxe Rentals AU** — as two cards with their logos, and pre-fills the
category from that choice.

### Wallet

Where the money sits, on the dashboard. Pick one account or **All accounts**:

- **Balance** is all-time, because that is what an account holds.
- **Spent** and **Received** are scoped to the selected month, because that is
  what the account has been doing lately. Conflating the two is how a balance
  starts looking wrong.
- All accounts lists every wallet with its balance and a bar for the month's
  spending; one account swaps that for its own records.

Account marks are square app icons that carry their own background, so they are
drawn full bleed in a fixed box - the same box whether an account has a logo or
falls back to a lucide glyph, so a row of them lines up. The logo is found by
the account's seeded `slug`, which means renaming an account keeps its mark.

Opening balances come from `entry/balance.csv`.

### Outlook

The one module that looks forward. Every other card reads only what has been
logged; Outlook adds the occurrences a schedule will produce and projects the
two together.

- **Month** follows the month selector and buckets by day, so the rhythm of a
  weekly payday against the bills around it is visible.
- **Range** takes any two months.
- **Year** takes a calendar year. Range and year bucket by month.
- Underneath, every record and scheduled payment in the window is listed, each
  tagged `logged` or `planned`.

What separates fact from forecast is the dashed **today** marker, not a second
colour: left of it is a record, right of it is a schedule. Position already says
which, so the palette is not asked to carry a meaning it would carry badly.

A planned occurrence on or before its schedule's `lastPostedDate` is dropped,
because logging it already created the transaction - counting both would double
it. Transfers are excluded from both sides.

## Stack

| Layer | Choice |
| --- | --- |
| Monorepo | Turborepo + npm workspaces |
| Frontend | Vite, React 19, TypeScript (strict), Tailwind CSS v4, shadcn-style components on Radix, lucide icons, Recharts |
| Data | SQLite WASM (`@sqlite.org/sqlite-wasm`) in a dedicated worker, Drizzle ORM over `sqlite-proxy` |
| State | Native React hooks only — no data-fetching or state library |

## Layout

```
apps/web                 the app: routes, components, hooks
packages/core            money, dates, taxonomy, analytics, schedules - pure TypeScript, no DOM
packages/db              Drizzle schema, migrations, the SQLite worker, every query
packages/theme           design tokens (CSS) and chart color accessors (TS)
packages/typescript-config  shared tsconfig bases
data/example-records.json   the records import format, filled in
data/pc-build-plan-2026-12-29.json   the PC build funding plan, as a schedule
```

The packages are consumed as TypeScript source — no build step, no `dist/` to
keep in sync. Turborepo runs `dev`, `build`, `typecheck` and `test` across them.

## How the data layer works

1. `packages/db/src/worker/sqlite.worker.ts` is the only place SQLite runs. It
   has to be a worker: durable storage uses the OPFS SyncAccessHandle pool VFS,
   and `createSyncAccessHandle()` exists only off the main thread.
2. The pool VFS was chosen over the plain `opfs` one because it needs no
   COOP/COEP headers — the build is a plain static bundle that runs from any
   file server.
3. The main thread talks to it through `SqliteBridge`, which Drizzle drives via
   its async `sqlite-proxy` driver. Drizzle builds the SQL; the bridge posts it
   across and hands back rows.
4. Migrations are the files Drizzle Kit generates in `packages/db/migrations`,
   inlined into the bundle and applied once each at startup (Drizzle Kit's own
   migrator reads the filesystem, which a browser does not have).
5. One tab at a time: the pool VFS allows a single connection, so a second tab
   is told so plainly instead of quietly opening an empty in-memory database.

Money is stored as an integer count of centavos, and always as a positive
magnitude — direction lives in `transactions.type`, so no query has to trust a
sign. Dates are `YYYY-MM-DD` text and months are `YYYY-MM`, because
lexicographic order is chronological order and nothing drifts across timezones.

### Changing the schema

```bash
npm run db:generate -w @advantage/db   # writes SQL into packages/db/migrations
```

Commit the generated file. It applies itself on the next load.

## Design

Dark by default: graphite surfaces (`#16181b` canvas, `#1d1f23` cards) rather
than black, a yellow-green accent (`#a3e635`), DM Sans, 12px radius. Light mode
is there as an opt-in toggle and keeps the app chrome dark.

Tailwind v4 gives buttons `cursor: default`. The pointer is restored once in
`theme.css`, covering both real buttons and the elements that only behave like
them - Radix tabs, options and radios are divs and spans underneath - rather
than adding `cursor-pointer` per component, which is a rule that gets forgotten
on the next control.

Chart colors are not a matter of taste here. The categorical palette, the
income/spending pair and every surface were run through a validator for the
lightness band, chroma floor, protan/deutan separation, normal-vision
separation and 3:1 contrast against the card surface. The seven-group cap on
expense categories exists so a breakdown chart never needs an eighth hue.
Consequences worth knowing before you edit `packages/theme/src/theme.css`:

- Cash flow puts income above the baseline and spending below it, so **position**
  carries the direction and color only reinforces it. That is what makes a
  green/red pair acceptable at a deuteranopic separation of 7.6.
- Every chart has a table view (the icon in its header) and a legend.
- The net line is not drawn through months with no records — a flat line at zero
  would claim a measurement that was never taken.

## Tests

```bash
npm test                          # core + db, in Node
npm run smoke -w @advantage/web   # the built app in real Chrome
```

- `packages/core` — money parsing and formatting, month arithmetic, recurrence,
  breakdown folding, budget pace.
- `packages/db` — real SQLite, real migrations, real Drizzle: seeding, joins,
  derived balances, the analytics aggregates, budgets against subcategories,
  posting and un-posting a planned payment, the outlook projection, backup and
  import.
- `apps/web/e2e/smoke.mjs` — drives the built app in Chrome: the worker opens,
  OPFS persists across a reload, an expense and an income save through the real
  forms, the cash flow bars point the right way, a plan file imports without
  moving net worth, Outlook draws in all three timeframes, the wallet lists
  every account with uniformly sized marks, interactive controls take a pointer
  cursor, every route renders, and the console stays clean. Needs Chrome or Edge installed (`CHROME_PATH` to
  override); `HEADLESS=false` to watch it. Screenshots land in
  `apps/web/e2e/screenshots`.

## Getting your data in

Settings → **Import a file** takes two shapes:

- a full backup previously downloaded from Settings, which replaces everything;
- a **records file** — `data/example-records.json` is a working example. One
  object per row, matching categories and accounts by slug or by visible name.
  Anything it cannot match is reported after the import rather than dropped
  silently.

The seed starts you with four planned payments taken from the spreadsheet this
replaces (Converge, VECO, and the two monthly payouts). Their due dates are
placeholders — set them to the real ones.

## Ideas for later

Nothing below is built yet; the schema already has room for most of it.

- **A payday-based month.** `monthStartDay` exists in the schema and defaults to
  1, but every query still cuts on calendar months, so there is no control for
  it yet - a setting that silently does nothing is worse than an absent one.
  Threading it through `monthStart`/`monthEnd` is what unlocks it.
- **Debt payoff view** for the installment plans — the spreadsheet tracked a
  declining balance per lender, which the current planned-payment model flattens.
- **Attachments** (a photo of a receipt) as a blob column plus OPFS files.
- **Multi-currency**, for the AUD side of Live Luxe: per-account currency exists
  in the schema but totals assume one currency.
- **A PWA manifest and service worker**, so it installs and opens offline.
