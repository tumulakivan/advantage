-- Bring an existing database up to the real set of wallets.
--
-- The seed only runs on an empty database, so a browser that was opened before
-- these accounts existed would never see them. This is a data migration: it
-- runs once, is recorded by name like any other, and is written to be safe on a
-- database that already has them.
--
-- Nothing is overwritten that someone may have typed: an account is only
-- inserted when its slug is missing, and no balance is ever touched. Balances
-- come from your own import, never from the repository.
--
-- Every insert is also gated on the table already having rows. On a brand new
-- database there is nothing to migrate - the seed runs straight afterwards and
-- owns the first write - and without the guard the two would race for the same
-- slugs and collide on the unique index.

INSERT INTO accounts (
  id, slug, name, type, icon, opening_balance_minor, currency,
  exclude_from_totals, sort_order, archived_at, created_at
)
SELECT
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) ||
    '-' || hex(randomblob(6))
  ),
  'maribank', 'Maribank', 'bank', 'Landmark', 0, 'PHP', 0, 0, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM accounts)
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE slug = 'maribank');
--> statement-breakpoint

INSERT INTO accounts (
  id, slug, name, type, icon, opening_balance_minor, currency,
  exclude_from_totals, sort_order, archived_at, created_at
)
SELECT
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) ||
    '-' || hex(randomblob(6))
  ),
  'unionbank', 'UnionBank', 'bank', 'Landmark', 0, 'PHP', 0, 1, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM accounts)
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE slug = 'unionbank');
--> statement-breakpoint

INSERT INTO accounts (
  id, slug, name, type, icon, opening_balance_minor, currency,
  exclude_from_totals, sort_order, archived_at, created_at
)
SELECT
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) ||
    '-' || hex(randomblob(6))
  ),
  'wise', 'Wise', 'ewallet', 'Landmark', 0, 'PHP', 0, 3, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM accounts)
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE slug = 'wise');
--> statement-breakpoint

-- Order them the way the wallet reads: banks, e-wallets, cash.
UPDATE accounts SET sort_order = 2 WHERE slug = 'gcash';
--> statement-breakpoint

UPDATE accounts SET sort_order = 4 WHERE slug = 'cash';
--> statement-breakpoint

-- The placeholders the first seed shipped sink below the real wallets. They are
-- left in place rather than deleted: records may point at them.
UPDATE accounts SET sort_order = 90 WHERE slug IN ('bank', 'savings');
