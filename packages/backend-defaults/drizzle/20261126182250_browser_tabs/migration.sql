CREATE TABLE `tabs` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`focused_at` integer,
	`visible` integer NOT NULL,
	`open` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_tabs_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `tabs_session_open_idx` ON `tabs` (`session_id`,`open`);