CREATE TABLE `instruction_blob` (
	`hash` text PRIMARY KEY,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `instruction_state` (
	`session_id` text PRIMARY KEY,
	`epoch_start` integer NOT NULL,
	`through_seq` integer NOT NULL,
	`initial_values` text NOT NULL,
	`current_values` text NOT NULL,
	CONSTRAINT `fk_instruction_state_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
