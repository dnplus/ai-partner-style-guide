CREATE TABLE `marketing_preferences` (
	`owner_hash` text PRIMARY KEY NOT NULL,
	`opted_in` integer NOT NULL,
	`contact_email` text,
	`consent_version` text NOT NULL,
	`updated_at` integer NOT NULL
);
