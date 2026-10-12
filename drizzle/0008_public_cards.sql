CREATE TABLE `public_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`card` text NOT NULL,
	`revoke_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_cards_session_id_unique` ON `public_cards` (`session_id`);--> statement-breakpoint
CREATE INDEX `public_cards_expiry` ON `public_cards` (`expires_at`);