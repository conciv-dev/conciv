CREATE TABLE `outside_notice` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`text` text,
	`delivered` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_outside_notice_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `outside_notice_session_delivered_idx` ON `outside_notice` (`session_id`,`delivered`);