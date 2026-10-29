DROP TABLE `runs`;--> statement-breakpoint
CREATE TABLE `runs` (
	`run_id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`phase` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_session_id_idx` ON `runs` (`session_id`);--> statement-breakpoint
ALTER TABLE `image_history` ADD `anchor_native_id` text;
