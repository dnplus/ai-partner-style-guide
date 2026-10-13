CREATE TABLE `funnel` (
	`day` text NOT NULL,
	`source` text NOT NULL,
	`step` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `source`, `step`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `via` text;