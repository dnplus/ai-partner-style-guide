CREATE TABLE `team_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`session_id` text NOT NULL,
	`member` text NOT NULL,
	`snapshot` text NOT NULL,
	`withdraw_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_entries_team` ON `team_entries` (`team_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_entries_session` ON `team_entries` (`team_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`view_hash` text NOT NULL,
	`join_code` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_join_code_unique` ON `teams` (`join_code`);--> statement-breakpoint
CREATE INDEX `teams_expiry` ON `teams` (`expires_at`);