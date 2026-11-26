CREATE TABLE `drafts` (
	`session_id` text PRIMARY KEY,
	`text` text NOT NULL,
	`selection_start` integer NOT NULL,
	`selection_end` integer NOT NULL,
	`grabs` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `markers` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`after_turn` integer NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY,
	`harness_session_id` text,
	`harness_kind` text NOT NULL,
	`origin` text NOT NULL,
	`title` text,
	`model` text,
	`usage` text,
	`cwd` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
