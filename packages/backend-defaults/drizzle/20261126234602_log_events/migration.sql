CREATE TABLE `log_events` (
	`id` text PRIMARY KEY,
	`timestamp` text NOT NULL,
	`level` text NOT NULL,
	`service` text NOT NULL,
	`environment` text NOT NULL,
	`message` text,
	`method` text,
	`path` text,
	`status` integer,
	`duration_ms` integer,
	`request_id` text,
	`source` text,
	`session_id` text,
	`error` text,
	`data` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `log_events_timestamp_idx` ON `log_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `log_events_level_idx` ON `log_events` (`level`);--> statement-breakpoint
CREATE INDEX `log_events_service_idx` ON `log_events` (`service`);--> statement-breakpoint
CREATE INDEX `log_events_status_idx` ON `log_events` (`status`);--> statement-breakpoint
CREATE INDEX `log_events_request_id_idx` ON `log_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `log_events_session_id_idx` ON `log_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `log_events_created_at_idx` ON `log_events` (`created_at`);