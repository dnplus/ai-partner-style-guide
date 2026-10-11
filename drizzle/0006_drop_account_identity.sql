DROP TABLE `marketing_preferences`;--> statement-breakpoint
ALTER TABLE `remembered_results` DROP COLUMN `owner_hash`;--> statement-breakpoint
ALTER TABLE `remembered_results` DROP COLUMN `report_access`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `owner_hash`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `email`;