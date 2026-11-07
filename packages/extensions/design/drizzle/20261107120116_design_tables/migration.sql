CREATE TABLE `design_fom` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`id` text NOT NULL,
	`node` text NOT NULL,
	`instance` text,
	`confidence` real NOT NULL,
	`margin` real NOT NULL,
	`round` integer NOT NULL,
	`revoted_round` integer,
	`reason` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_rounds` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`counts` text NOT NULL,
	`coverage` text NOT NULL,
	`reflow` text NOT NULL,
	`pixel_share` real,
	`tree` text NOT NULL,
	`live` text,
	`diff` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_rows` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`id` text,
	`node` text NOT NULL,
	`source` text,
	`selector` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`magnitude` text NOT NULL,
	`width` real,
	`text` text NOT NULL,
	`confidence` real,
	`margin` real,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_runs` (
	`run_id` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text,
	`model` text NOT NULL,
	`prompt_head` text NOT NULL,
	`started` integer NOT NULL,
	`ended` integer,
	`cost` real,
	`verdict` text
);
--> statement-breakpoint
CREATE TABLE `design_targets` (
	`target_id` text PRIMARY KEY,
	`run_id` integer,
	`session` text NOT NULL,
	`link` text NOT NULL,
	`route` text,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`scale` real NOT NULL,
	`design` text NOT NULL,
	`ids` text,
	`image` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_tool_calls` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text,
	`run_id` integer,
	`tool` text NOT NULL,
	`input` text,
	`reply_bytes` integer,
	`duration_ms` integer NOT NULL,
	`error` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_votes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`candidate` text NOT NULL,
	`path` text NOT NULL,
	`dom` real NOT NULL,
	`src` real NOT NULL,
	`cssom` real NOT NULL,
	`total` real NOT NULL,
	`won` integer NOT NULL,
	`at` integer NOT NULL
);
