CREATE TABLE `claim_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`recorded_by` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_revision_unique` ON `claim_revisions` (`claim_id`,`revision`);--> statement-breakpoint
ALTER TABLE `claims` ADD `revision` integer DEFAULT 1 NOT NULL;