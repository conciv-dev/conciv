CREATE TABLE `event_sequence` (
	`aggregate_id` text PRIMARY KEY,
	`seq` integer NOT NULL,
	`owner_id` text
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY,
	`aggregate_id` text NOT NULL,
	`seq` integer NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_event_aggregate_id_event_sequence_aggregate_id_fk` FOREIGN KEY (`aggregate_id`) REFERENCES `event_sequence`(`aggregate_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_aggregate_seq_idx` ON `event` (`aggregate_id`,`seq`);--> statement-breakpoint
CREATE INDEX `event_aggregate_type_seq_idx` ON `event` (`aggregate_id`,`type`,`seq`);