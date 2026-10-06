# adVantage: notes for Claude

A personal budget tracker. npm workspaces + Turbo monorepo:

- `apps/api`: Express 5, Prisma (PostgreSQL), Better Auth, zod. Queries live in `src/queries`, routes in `src/routes`, mail transports in `src/mail`.
- `apps/web`: Vite + React app.
- `packages/core`: the money arithmetic and shared types. It was copied verbatim from the earlier local-first version, so treat it as the source of truth for numbers.
- `packages/api-client`: typed fetch and query hooks used by the web app.

## Running it

The README covers this. In short: `npm run setup`, then `npm run dev`. The API runs on :4000 and the web app on :5173, with Postgres in Docker on **5433**. The shell is Windows PowerShell 5.1, which has no `&&`, so run commands one per line or join them with `;`.

`.env` is gitignored, and `npm run setup:env` generates it from `.env.example` with a fresh secret. Sign-in requires a confirmed email. In dev, mail is never sent: links are printed in the API terminal and appended to `.mail/outbox.jsonl`. Use `npm run user:verify` to confirm an account by hand and `npm run admin -- --email <addr>` to create the admin (the address must be in `ADMIN_EMAILS`).

## Personal data never goes in git

The repo may be public. Real figures live only in the local Postgres volume, in `data/private/` and in `initial_data/`, and all of them are gitignored. Never commit them, and never put real balances in seeds, tests or docs.

**Moving to another machine:** on the old one, export a JSON backup from **Settings → data tools**. On the new one, after setup, load it through **Settings → Import a file**. You can also run `npm run import:backup -w @advantage/api`. Copy the file across by hand, not through git.

## Conventions

- Amounts are integer centavos (`amountMinor`), positive, with direction taken from `type`. The exception is `adjustment` (Set balance on Accounts), which is signed and is not income or spending. Outlook and other income/expense views must keep filtering to `type in [income, expense]`.
- Every query is scoped by `userId`. App-level scoping is the only tenant isolation for now, because Postgres row-level security is deferred.
- Keep README commands single-line, for PowerShell's sake.

## Deferred on purpose

Postgres row-level security, optimistic writes, and deployment (production needs `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` and `MAIL_FROM`, or the API refuses to start).

## Checks

`npm run typecheck`, `npm test` (vitest in `apps/api`) and `npm run smoke` (API and web e2e; needs the dev servers running and `admin@example.test` in `ADMIN_EMAILS` for the admin half).
