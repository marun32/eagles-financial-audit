CREATE TABLE `actors` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`player_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`stage` text NOT NULL,
	`route` text NOT NULL,
	`findings_json` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`team_season_id` text NOT NULL,
	`claimant_id` text NOT NULL,
	`payer_id` text NOT NULL,
	`category` text NOT NULL,
	`vendor` text NOT NULL,
	`description` text NOT NULL,
	`expense_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`alcohol` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'SUBMITTED' NOT NULL,
	`receipt_key` text,
	`receipt_name` text,
	`receipt_type` text,
	`receipt_extraction_json` text,
	`route` text,
	`findings_json` text DEFAULT '[]' NOT NULL,
	`policy_citations_json` text DEFAULT '[]' NOT NULL,
	`approved_amount_cents` integer,
	`decision_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_season_id`) REFERENCES `team_seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claimant_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `config_history` (
	`id` text PRIMARY KEY NOT NULL,
	`team_season_id` text NOT NULL,
	`version` integer NOT NULL,
	`changed_by` text NOT NULL,
	`changes_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_season_id`) REFERENCES `team_seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`team_season_id` text NOT NULL,
	`match_number` integer NOT NULL,
	`played_date` text,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	FOREIGN KEY (`team_season_id`) REFERENCES `team_seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_team_number_unique` ON `matches` (`team_season_id`,`match_number`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`section_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`policy_type` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roster` (
	`team_season_id` text NOT NULL,
	`player_id` text NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`team_season_id`, `player_id`),
	FOREIGN KEY (`team_season_id`) REFERENCES `team_seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`team_season_id` text NOT NULL,
	`status` text NOT NULL,
	`total_pool_cents` integer NOT NULL,
	`rows_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_season_id`) REFERENCES `team_seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `system_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`team_season_id` text NOT NULL,
	`match_id` text,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_season_id`) REFERENCES `team_seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`team_name` text NOT NULL,
	`season_kind` text NOT NULL,
	`season_year` integer NOT NULL,
	`league_fee_cents` integer NOT NULL,
	`umpire_fee_cents` integer DEFAULT 6000 NOT NULL,
	`scheduled_games` integer DEFAULT 10 NOT NULL,
	`season_start` text NOT NULL,
	`season_end` text NOT NULL,
	`multipliers_json` text DEFAULT '[0,0.5,0.75,0.75,1,1,1,1.25,1.25,1.25,1.25]' NOT NULL,
	`claim_deadline` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_season_unique` ON `team_seasons` (`team_name`,`season_kind`,`season_year`);