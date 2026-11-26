CREATE TABLE `css_bundles` (
	`hash` text PRIMARY KEY,
	`css` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_captures` (
	`tool_call_id` text NOT NULL,
	`kind` text NOT NULL,
	`session_id` text NOT NULL,
	`css_bundle_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `tool_captures_pk` PRIMARY KEY(`tool_call_id`, `kind`, `session_id`)
);
--> statement-breakpoint
CREATE INDEX `tool_captures_session_id_idx` ON `tool_captures` (`session_id`);