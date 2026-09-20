# adVantage

A personal budget tracker you can sign up for and use from anywhere. Records
live in PostgreSQL behind an Express API; each account sees its own ledger and
nobody else's, and Settings will hand all of it back as a file whenever you
ask.

Built because..... I wanted to see if I could finally afford a gaming PC?

```
npm run setup
npm run dev
```

`setup` installs, writes a `.env` with a freshly generated session secret,
starts Postgres in Docker and applies the migrations. `dev` then runs the API
on `:4000` and the app on <http://localhost:5173>.

The same thing one step at a time, if you would rather watch it happen:

```
npm install
npm run setup:env
npm run db:up
npm run db:migrate
npm run dev
```

Every command in this README is a single line on purpose. Windows PowerShell 5.1
has no `&&` and does not treat a trailing `\` as a line continuation, so
commands written the usual way fail there with
`The token '&&' is not a valid statement separator`. Run the lines one at a
time, or join them with `;`. Inside an npm script `&&` is fine — npm runs those
through `cmd.exe`.

## What it does today

| Screen | What it is for |
| --- | --- |
| **Dashboard** | Income, spending, net saved and net worth for the month; six-month cash flow; spending by group; **Wallet**; **Outlook**; income split by source; what is due next; budget progress; biggest expenses. |
| **Transactions** | Every record, grouped by day with a day total. Filter by type, account, category or free text, over one month or all time. |
| **Budgets** | A monthly ceiling per group (or one overall). Shows what is spent, what is left, and whether the *pace* lands over the line before month end. |
| **Planned** | The recurring side: bills, installments and payouts. One tap turns a due item into a real record, and Undo takes it back out. |
| **Accounts** | Starts with Cash. Add the rest from the shared catalog, each with its own mark, or set up your own with a name and an icon. Balances are derived from records, never typed in. |
| **Categories** | Seven expense groups, each owning one chart color, with subcategories beneath. |
| **Settings** | Currency and number format, theme, your income sources, the data tools (JSON backup, import, erase), and account deletion. |
| **Admin** | The whole app for an admin account, and the only screen it has: how the app is being used, and the account catalog everyone picks from. No one's records are readable from it. |

Adding an expense asks for a category (groups and subcategories in one picker).
Adding income asks which source it came from, as cards, and pre-fills the
category from that choice. A new account starts with one generic **Salary**
source as an example to rename; add your own in Settings — an employer, three
clients, a tenant, whatever your arrangement is.

Income sources are **text only**. Whose payroll it is is your business, not a
brand for this app to host and moderate, so each card carries the initial on a
chip in that source's own chart colour — the same colour it has in the income
breakdown, so the card and the chart agree without anyone having to remember
which is which.

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
falls back to a lucide glyph, so a row of them lines up. The artwork comes from
the shared catalog, matched on the account's `slug`, which means renaming an
account keeps its mark.

### Accounts, and the catalog

A new account holds **Cash** and nothing else. Everyone has cash; nobody has
every bank, and seeding five of them means a new user's first task is deleting
four accounts that were never theirs.

The rest come from a **shared catalog** — one curated list, the same for
everybody, holding the name, type and artwork for each known account. Adding one
copies its slug onto your own wallet, which is what gives that wallet its mark
and what an import file matches on. Everything after that is yours: renaming
your GCash does not rename anybody else's, and an admin renaming the catalog
entry does not rename yours.

What the catalog does not have yet, **Something else** covers: a name, a lucide
glyph, and no logo. Waiting on someone to publish PayPal is not a reason to be
unable to track your money. Ask an admin when you want the artwork.

The catalog is seeded from `icons/` by `npm run db:seed:catalog`, which is part
of `npm run setup`. It is idempotent — re-running it fills gaps without undoing
anything an admin has since changed.

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
| Backend | Express 5 on Node, TypeScript (strict), Zod at every write |
| Data | PostgreSQL 17, Prisma |
| Identity | Better Auth, its tables in the same database |
| State | Native React hooks only — no data-fetching or state library |

## Layout

```
apps/api                 Express service: routes, the ported query layer, Prisma schema
apps/web                 the app: routes, components, hooks
packages/core            money, dates, taxonomy, analytics, schedules - pure TypeScript, no DOM, no database
packages/api-client      the wire contract and a typed fetch client
packages/theme           design tokens (CSS) and chart color accessors (TS)
packages/typescript-config  shared tsconfig bases
icons/                      the artwork the account catalog is seeded from
data/example-records.json   the records import format, filled in
data/example-plan.json      a schedule of future obligations, as a plan file
docs/                       the migration roadmap, and the report on carrying it out
```

The packages are consumed as TypeScript source — no build step, no `dist/` to
keep in sync. Turborepo runs `dev`, `build`, `typecheck` and `test` across them.

## How the data layer works

The app used to be local-first: SQLite compiled to WebAssembly, in a worker, in
your own browser storage. That version is the reference this one was ported
from, and the shape it left behind is why the port was a port and not a rewrite.

1. Every query function takes a **tenant handle** — `{ db, userId }` — as its
   first argument, the same position the SQLite database used to occupy. There
   is no way to call one without naming a user, and `routes/` cannot reach the
   unscoped Prisma client at all.
2. The session middleware builds that handle from the session cookie. Every
   route below `/api` runs behind it, so a request without a user does not
   reach a query.
3. Writes scope through the `where` clause (`updateMany`, `deleteMany`) rather
   than by id alone, so one person's id can never address another's row.
4. `apps/api/src/queries/screens.ts` assembles whole screens server-side. The
   dashboard used to fan out about twelve queries from the browser, which is
   free against a local file and a thundering herd over a network.
5. `packages/core` is untouched by any of it. All 1,252 lines still know
   nothing about a database, which is what let the arithmetic move from the
   browser to the server without being rewritten.

Money is stored as an integer count of centavos, and always as a positive
magnitude — direction lives in `transactions.type`, so no query has to trust a
sign. The column is a 32-bit integer, so a single record tops out around 21.4
million pesos; widening it is a one-line migration if that ever binds.

Dates are `YYYY-MM-DD` text and months are `YYYY-MM`, as they were under
SQLite, because lexicographic order is chronological order and nothing drifts
across timezones. Keeping the storage shape also keeps the backup file
byte-compatible: one downloaded from the offline build imports here unchanged.

### Changing the schema

```bash
npm run db:migrate     # prisma migrate dev, against the compose database
```

Commit the generated SQL in `apps/api/prisma/migrations`.

## Admin

Whoever is listed in `ADMIN_EMAILS` gets a different app, not an extra screen.
It shows how the service is being used - people, active accounts, sign-ups by
week, row counts, and which catalog accounts people actually add - and it is
where the catalog is curated: add an account, give it a logo, rename one, hide
one. That is all of it.

**An admin account has no ledger.** Not hidden, not empty - it is never created.
The seed skips admin addresses, every ledger route refuses them with a 403, and
the browser sends them back to `/admin` from any personal URL. Administering the
service and tracking your own money are two jobs, and this app makes them two
accounts.

### Setting one up

Admin is a property of an **email address**, not of a person, so an admin is
just an account whose address is on the list.

1. Put the address in `.env`, comma-separated for more than one:

   ```
   ADMIN_EMAILS="admin@advantage.com"
   ```

2. Create the account and set its password:

   ```
   npm run admin -- --email admin@advantage.com
   ```

   That prints a generated password once, unless `ADMIN_PASSWORD` is set in
   `.env` - see below - in which case it uses that one. To choose one on the
   spot instead:

   ```
   npm run admin -- --email admin@advantage.com --password "something long"
   ```

   Run it again later to set a new password - it creates the account the first
   time and resets it after that. It refuses any address that is not in
   `ADMIN_EMAILS`, which is also what catches having skipped step 1.

3. Restart the API and sign in. It prints the list on boot, so a typo shows as a
   wrong address rather than as a screen that never appears:

   ```
   adVantage API listening on http://localhost:4000
   Admin: admin@advantage.com
   ```

The address can be **made up**. There is no email verification and no
deliverability check anywhere - it is an identifier, not a mailbox, and nothing
is ever sent to it. If you would rather it could not collide with a real
domain, the ones reserved for exactly this are `example.com` and anything under
`.test` or `.invalid`: `admin@advantage.test` is as valid here as
`admin@advantage.com`. A plus-address on a mailbox you own -
`you+admin@gmail.com` - is the other good option, and the only one that keeps
working if email verification is ever turned on.

**The address has to be separate from the one you track your own money with**,
because an admin account cannot do both. Put your own address on that list and
you lose your dashboard - the records stay in the database, untouched and out of
reach, and come back the moment the address comes off the list again. That is
recoverable, but it is not what you want on a Tuesday morning.

### Keeping it without rerunning anything

The account lives in Postgres, in the `advantage-pgdata` volume, so once it
exists it survives `npm run db:down`, a reboot and a reinstall. There is
nothing to run at startup.

What does not survive is `npm run db:reset` or `docker compose down -v`, which
drop the volume and the account with it. If you would rather not think about
that, put a password in `.env`:

```
ADMIN_PASSWORD="something long"
```

`npm run dev` then reconciles the account before starting anything: it creates
it if it is missing, sets the password if it has drifted, and otherwise does
nothing at all. The no-op case is a second on a cold start and nothing after,
because it compares against the stored hash rather than writing a new one. It
cannot stop you working either - if Postgres is not up yet it says so in one
line and the dev server starts anyway.

This is a local convenience rather than a production pattern. The password is
readable on disk, and it becomes *the* password: every start puts it back, so
changing it any other way will not stick while the variable is set. `.env` is
gitignored. Leave `ADMIN_PASSWORD` unset on a deployed service and create the
account there by hand.

### Where the password lives

Nowhere readable, including for you. Better Auth hashes it with scrypt; there is
no screen, no file and no command that can show you an existing one, which is
the property you want. You set it with `npm run admin`, and you keep it in a
password manager.

There is no password reset in the app yet, because no transactional sender is
wired and a reset mail that never arrives is worse than none. For an ordinary
account that is survivable - the owner signs up again. For the only admin it
would mean losing the ability to curate the catalog with no way back, which is
why `npm run admin` can reset the password directly against the database.

Two decisions are worth stating plainly.

**Admin is configuration, not a column.** The list lives on the service, so
there is no privilege-escalation path through the product at all: nothing a user
can do to their own row makes them an admin, and the answer survives a database
restore. Changing it needs a restart, which for a list that changes once a year
is the right trade.

**There is no route that reads anyone's records - not even the admin's own -
and that is deliberate rather than unfinished.** Running this means curating a list of logos and watching
whether people come back; it does not mean being able to look at somebody's
spending. The metrics endpoint returns counts and dates and nothing else, and
the way to keep that true is for the other endpoint not to exist. The admin
routes answer 404 rather than 403 to everyone else, because someone who is not
an admin has no business learning they are there.

Logos have to be **square**. Account marks are drawn full bleed in a square box,
so anything else arrives stretched or cropped; refusing it is kinder than
silently distorting somebody's brand. The browser checks before uploading so the
message can name the dimensions, and the server checks again, because a client
check is a courtesy rather than a rule. PNG, JPEG or WebP, under 512 KB, stored
in Postgres - covered by the same backup as everything else, rather than a
directory someone has to remember.

## Tenancy

Every application table carries `user_id`, from the first migration. Retrofitting
that later is far harder than starting with it, and a missing `WHERE` clause
here leaks someone's salary and debts rather than a preference.

Three things enforce it, in order of how much they are relied on:

- the tenant handle, which makes an unscoped query awkward to write;
- `ON DELETE CASCADE` from the user row, so "delete my account" deletes the
  records too rather than orphaning them;
- the isolation tests, in `src/queries/queries.test.ts` and `scripts/smoke.mjs`,
  which point one account at every one of another's row ids and check that
  nothing comes back.

Row-level security in Postgres is the obvious next layer and is **not** in place
yet. The application-level scoping above is currently the only thing between two
users' data, which is why it is tested at both the query layer and over HTTP.

## Getting your data in

Settings → **Import a file** takes three shapes, told apart by their `format`:

- a **backup** previously downloaded from Settings — including one from the old
  offline build — which replaces everything in your account;
- a **records file** — `data/example-records.json` is a working example. One
  object per row, matching categories and accounts by slug or by visible name.
  Anything it cannot match is reported after the import rather than dropped
  silently;
- a **plan file** — `data/example-plan.json` — a dated schedule of what is still
  to come. It loads into Planned, never into your balances, because nothing in
  it has happened yet.

To load a backup into an account from the command line — which is how the
records from the offline build became user number one:

```
npm run import:backup -w @advantage/api -- --email you@example.com --file ./initial_data/advantage-backup-2026-09-19.json
```

Sign up in the app first so the account exists. It refuses to overwrite a ledger
that already has records unless you pass `--force`, and writes a safety copy
first when you do.

The seed starts a new account with four planned payments as placeholders
(Converge, VECO, and the two monthly payouts). Their due dates and amounts are
round numbers — set them to the real ones, or import a plan file.

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

### Chrome, and the narrow layout

The rail is a full-height edge and reads as structure whatever colour the page
is, so it stays dark in both themes. The **mobile nav strip does not**: a dark
band wedged between a white header and a white page reads as something that
failed to load rather than as chrome. It takes the card surface and the ordinary
accent instead, which makes it graphite with lime in the dark and white with
green in the light.

The top bar carries a useless fact, from
[uselessfacts.jsph.pl](https://uselessfacts.jsph.pl) - a new one every page
load. It is fetched on mount rather than per navigation, so moving between
screens does not go asking again; it sends no credentials and no referrer; and
it fails silently, because an app holding your financial records should not
show you an error when a third party is having a bad day. The smoke test serves
it a canned answer rather than reaching across the internet, so the suite does
not go red when someone else's server does.

Who is signed in, the theme switch and the way out sit together in the top
right. They are the only controls on screen that are about the session rather
than about money, and keeping them in one cluster means the narrow layout has
one thing to collapse rather than three - the address drops to an initial and
the rest stays put.

The failure worth testing for is a page wider than its viewport: one control
group that will not wrap pushes the whole document sideways, and it is
completely invisible at desktop width. The smoke test measures
`scrollWidth` against `clientWidth` on every screen at 390px for that reason.

### What a network changed

Reads used to cost about 0.2 ms, so the app refetched everything after every
write and never had to think about it. Two things follow from them costing a
round trip now:

- The heavy screens are one endpoint each, so an invalidation is a handful of
  requests rather than twenty.
- `useLiveQuery` reports `stale` — a request in flight *for a different question
  than the one the data on screen answers*. Re-running the same query after a
  write and briefly showing the previous figures is a courtesy; changing the
  month and showing last month's figures under this month's heading is a lie,
  and the screens that can do that check for it.

## Tests

```bash
npm test                          # core + the data layer, needs the database up
npm run smoke                     # the API and then the built app in real Chrome
```

- `packages/core` — 32 tests. Money parsing and formatting, month arithmetic,
  recurrence, breakdown folding, budget pace. Unchanged from the offline build.
- `apps/api` — 45 tests against real Postgres, real migrations, real Prisma:
  seeding, joins, derived balances, the analytics aggregates, budgets against
  subcategories, posting and un-posting a planned payment, the outlook
  projection, backup and import, and tenant isolation. They create their own
  throwaway accounts and delete them afterwards.
- `apps/api/scripts/smoke.mjs` — 97 checks over HTTP against a running service:
  sign-up, the first-run seed, the whole ledger, the account catalog, the admin
  surface from both sides - including every ledger route refusing an admin - and
  the isolation model end to end, such as one account restoring an empty backup
  being unable to wipe another. The admin half
  needs `ADMIN_EMAILS` to contain `admin@example.test`, and says so and skips if
  it does not.
- `apps/web/e2e/smoke.mjs` — 77 checks driving the built app in Chrome: sign-up,
  the session cookie surviving a reload, an expense and an income through the
  real forms, the cash flow bars pointing the right way, a plan file importing
  without moving net worth, Outlook in all three timeframes, the wallet with
  uniformly sized marks, every route, sign-out, and a clean console. The last
  section drops to a 390px viewport and checks that no page scrolls sideways,
  that the rail gives way to the nav strip, and that the strip is light in light
  mode - all three being failures that are invisible at desktop width. Needs
  Chrome or Edge (`CHROME_PATH` to override) and the API running; `HEADLESS=false`
  to watch it. Screenshots land in `apps/web/e2e/screenshots`.

The API smoke test and the browser test both need the service up, and the
browser one serves the build on port 4173 — which is in `WEB_ORIGIN` for that
reason.

## Deploying

Nothing here is scale engineering, because at this size none of it needs to be.

- The API runs anywhere Node does; the web build stays a static bundle. Set
  `VITE_API_URL` at build time and `WEB_ORIGIN` on the service to match.
- `npm run db:deploy -w @advantage/api` applies migrations without prompting.
- Set `NODE_ENV=production`, which is what turns on secure, `SameSite=None`
  cookies — the API and the app are different origins.
- Any managed Postgres works. The compose file is for development.
- Take a backup, restore it into a scratch database, and confirm the data is
  there before anyone else depends on it. An untested backup is not a backup.

Request logging is deliberately quiet: no amounts, no payees, no email
addresses. A log that accumulates someone's spending is a second copy of their
financial history in a place nobody is guarding.

## Ideas for later

Nothing below is built yet; the schema already has room for most of it.

- **Row-level security**, so the application-level scoping is the fast path
  rather than the only defence.
- **Email verification and password reset**, on a transactional sender's free
  tier. Better Auth already has the hooks; there is nowhere to send mail yet.
- **Optimistic writes** where the lag is most obvious — adding a record, logging
  a planned payment. Client-generated UUIDs are kept for exactly this.
- **A payday-based month.** `monthStartDay` exists and defaults to 1, but every
  query still cuts on calendar months, so there is no control for it yet - a
  setting that silently does nothing is worse than an absent one.
- **Debt payoff view** for the installment plans — the spreadsheet tracked a
  declining balance per lender, which the planned-payment model flattens.
- **Attachments** (a photo of a receipt).
- **Multi-currency**, for the AUD side of Live Luxe: per-account currency exists
  in the schema but totals assume one currency.
