CREATE TABLE `sources` (
	`name` text PRIMARY KEY,
	`extension` text NOT NULL,
	`source` text NOT NULL,
	`table` text NOT NULL,
	`fields` text NOT NULL,
	`order` integer NOT NULL,
	`writable` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`name` text PRIMARY KEY,
	`extension` text NOT NULL,
	`command` text NOT NULL,
	`description` text NOT NULL,
	`positionals` text NOT NULL
);
