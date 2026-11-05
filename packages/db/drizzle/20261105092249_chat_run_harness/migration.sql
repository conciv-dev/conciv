CREATE TABLE `__new_chat_runs` (
	`run_id` text PRIMARY KEY,
	`thread_id` text NOT NULL,
	`harness_id` text NOT NULL,
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
INSERT INTO `__new_chat_runs` (`run_id`, `thread_id`, `harness_id`, `status`, `started_at`, `finished_at`, `error`, `error_code`, `usage_json`, `sandbox_key`, `detached_since`, `cancel_requested`, `driver_epoch`) SELECT `run_id`, `thread_id`, COALESCE((SELECT `harness_kind` FROM `sessions` WHERE `sessions`.`id` = `chat_runs`.`thread_id`), 'claude'), `status`, `started_at`, `finished_at`, `error`, `error_code`, `usage_json`, `sandbox_key`, `detached_since`, `cancel_requested`, `driver_epoch` FROM `chat_runs`;
--> statement-breakpoint
DROP TABLE `chat_runs`;
--> statement-breakpoint
ALTER TABLE `__new_chat_runs` RENAME TO `chat_runs`;
--> statement-breakpoint
CREATE INDEX `chat_runs_status_detached` ON `chat_runs` (`status`,`detached_since`);
--> statement-breakpoint
CREATE INDEX `chat_runs_thread_started` ON `chat_runs` (`thread_id`,`started_at`);
