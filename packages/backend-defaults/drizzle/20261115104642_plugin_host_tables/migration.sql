CREATE TABLE IF NOT EXISTS `event_sequence` (
	`aggregate_id` text PRIMARY KEY,
	`seq` integer NOT NULL,
	`owner_id` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `event` (
	`id` text PRIMARY KEY,
	`aggregate_id` text NOT NULL,
	`seq` integer NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_event_aggregate_id_event_sequence_aggregate_id_fk` FOREIGN KEY (`aggregate_id`) REFERENCES `event_sequence`(`aggregate_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kv` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `permission` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `event_aggregate_seq_idx` ON `event` (`aggregate_id`,`seq`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `event_aggregate_type_seq_idx` ON `event` (`aggregate_id`,`type`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `permission_project_action_resource_idx` ON `permission` (`project_id`,`action`,`resource`);