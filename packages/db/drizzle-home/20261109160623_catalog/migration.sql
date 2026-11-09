CREATE TABLE `component_flags` (
	`project` text NOT NULL,
	`component_id` text NOT NULL,
	`flag` text NOT NULL,
	`at` integer NOT NULL,
	CONSTRAINT `component_flags_pk` PRIMARY KEY(`project`, `component_id`)
);
--> statement-breakpoint
CREATE TABLE `component_scans` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`project` text NOT NULL,
	`tree` text NOT NULL,
	`fingerprint` text NOT NULL,
	`modules` integer NOT NULL,
	`components` integer NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `components` (
	`project` text NOT NULL,
	`tree` text NOT NULL,
	`id` text NOT NULL,
	`names` text NOT NULL,
	`file` text NOT NULL,
	`pkg` text,
	`version` text,
	`specifier` text NOT NULL,
	`renders` integer NOT NULL,
	`sentence` text,
	`props` text NOT NULL,
	`usage` text,
	`story` text,
	`lines` text NOT NULL,
	`imports` integer NOT NULL,
	`scanned_at` integer NOT NULL,
	CONSTRAINT `components_pk` PRIMARY KEY(`project`, `tree`, `id`)
);
