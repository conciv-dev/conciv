CREATE TABLE `replies` (
	`session_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `replies_pk` PRIMARY KEY(`session_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `run_messages` (
	`session_id` text PRIMARY KEY,
	`messages` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`session_id` text PRIMARY KEY,
	`status` text DEFAULT 'idle' NOT NULL,
	`run_epoch` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
