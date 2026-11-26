CREATE TABLE `chat_runs` (
	`run_id` text PRIMARY KEY,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`error_code` text,
	`usage_json` text,
	`sandbox_key` text,
	`detached_since` integer,
	`cancel_requested` integer,
	`driver_epoch` integer
);
--> statement-breakpoint
CREATE INDEX `chat_runs_status_detached` ON `chat_runs` (`status`,`detached_since`);--> statement-breakpoint
CREATE INDEX `chat_runs_thread_started` ON `chat_runs` (`thread_id`,`started_at`);