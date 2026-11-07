CREATE TABLE `design_labels` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`round` integer,
	`node` text NOT NULL,
	`id` text,
	`verdict` text NOT NULL,
	`by` text NOT NULL,
	`note` text,
	`at` integer NOT NULL,
	CONSTRAINT "verdict" CHECK("verdict" in ('right', 'wrong'))
);
--> statement-breakpoint
CREATE TABLE `design_notes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`round` integer,
	`text` text NOT NULL,
	`at` integer NOT NULL
);
