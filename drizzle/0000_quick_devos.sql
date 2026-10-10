CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`read_hash` text NOT NULL,
	`write_hash` text NOT NULL,
	`owner_hash` text,
	`nickname` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`submitted_at` integer,
	`idempotency_key` text,
	`payload_hash` text,
	`report` text
);
--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);