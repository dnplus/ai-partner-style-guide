CREATE TABLE `remembered_results` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`owner_hash` text,
	`expires_at` integer NOT NULL,
	`report` text NOT NULL,
	`report_access` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `remembered_expiry` ON `remembered_results` (`expires_at`);