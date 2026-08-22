CREATE TABLE `settings_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`key` text NOT NULL,
	`value` text,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_log_key_id_idx` ON `settings_log` (`key`,`id`);