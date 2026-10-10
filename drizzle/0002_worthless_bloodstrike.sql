ALTER TABLE `sessions` ADD `progress_phase` text DEFAULT 'not_connected' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `progress_sequence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `progress_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `approval_kind` text;