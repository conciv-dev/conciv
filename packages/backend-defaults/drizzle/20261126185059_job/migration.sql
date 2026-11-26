CREATE TABLE `job` (
	`notification_id` text PRIMARY KEY,
	`id` text NOT NULL,
	`session_id` text NOT NULL,
	`child_session_id` text,
	`kind` text NOT NULL,
	`title` text,
	`status` text NOT NULL,
	`output` text,
	`error` text,
	`recovery` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_session_idx` ON `job` (`session_id`);--> statement-breakpoint
CREATE INDEX `job_child_session_idx` ON `job` (`child_session_id`);--> statement-breakpoint
CREATE INDEX `job_id_idx` ON `job` (`id`);