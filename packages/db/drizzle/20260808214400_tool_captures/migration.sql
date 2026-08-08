CREATE TABLE `css_bundles` (
	`hash` text PRIMARY KEY,
	`session_id` text NOT NULL,
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
	CONSTRAINT `tool_captures_pk` PRIMARY KEY(`tool_call_id`, `kind`)
);
