ALTER TABLE `sessions` ADD `deleted_at` integer;--> statement-breakpoint
DROP INDEX IF EXISTS `sessions_harness_session_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_native_key_unique` ON `sessions` (`harness_kind`,`cwd`,`harness_session_id`);