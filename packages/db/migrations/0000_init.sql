CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'cash' NOT NULL,
	`icon` text DEFAULT 'Wallet' NOT NULL,
	`color` text,
	`opening_balance_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`exclude_from_totals` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_slug_idx` ON `accounts` (`slug`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`amount_minor` integer NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`start_month` text NOT NULL,
	`rollover` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `budgets_category_idx` ON `budgets` (`category_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'expense' NOT NULL,
	`icon` text DEFAULT 'Tag' NOT NULL,
	`color` text,
	`parent_id` text,
	`is_system` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_idx` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `categories_kind_idx` ON `categories` (`kind`);--> statement-breakpoint
CREATE TABLE `income_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`logo` text,
	`color` text,
	`default_category_id` text,
	`default_account_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_sources_slug_idx` ON `income_sources` (`slug`);--> statement-breakpoint
CREATE TABLE `planned_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'expense' NOT NULL,
	`amount_minor` integer NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`anchor_date` text NOT NULL,
	`end_date` text,
	`account_id` text,
	`category_id` text,
	`income_source_id` text,
	`note` text,
	`last_posted_date` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`income_source_id`) REFERENCES `income_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planned_active_idx` ON `planned_payments` (`active`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`income_source_id` text,
	`payee` text,
	`note` text,
	`planned_payment_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`income_source_id`) REFERENCES `income_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_type_date_idx` ON `transactions` (`type`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_source_idx` ON `transactions` (`income_source_id`);--> statement-breakpoint
CREATE INDEX `transactions_planned_idx` ON `transactions` (`planned_payment_id`);