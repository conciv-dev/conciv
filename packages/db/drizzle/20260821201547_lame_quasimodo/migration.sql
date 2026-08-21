CREATE TABLE `page_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`session_id` text NOT NULL,
	`verb` text NOT NULL,
	`ref` text,
	`selector` text,
	`args` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `page_changes_session_id_idx` ON `page_changes` (`session_id`);