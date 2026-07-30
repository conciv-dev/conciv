ALTER TABLE `sessions` ADD `transcript_cwd` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `attached_pid` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `attached_at` integer;--> statement-breakpoint
UPDATE `sessions` SET `harness_session_id` = NULL WHERE `harness_session_id` IS NOT NULL AND rowid NOT IN (SELECT MIN(rowid) FROM `sessions` WHERE `harness_session_id` IS NOT NULL GROUP BY `harness_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_harness_session_id_unique` ON `sessions` (`harness_session_id`);