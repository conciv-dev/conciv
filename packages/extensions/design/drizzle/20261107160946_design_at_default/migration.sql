PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_labels` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer,
	`node` text NOT NULL,
	`id` text,
	`verdict` text NOT NULL,
	`by` text NOT NULL,
	`note` text,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "verdict" CHECK("verdict" in ('right', 'wrong'))
);
--> statement-breakpoint
INSERT INTO `__new_design_labels`(`seq`, `target_id`, `run_id`, `round`, `node`, `id`, `verdict`, `by`, `note`, `at`) SELECT `seq`, `target_id`, `run_id`, `round`, `node`, `id`, `verdict`, `by`, `note`, `at` FROM `design_labels`;--> statement-breakpoint
DROP TABLE `design_labels`;--> statement-breakpoint
ALTER TABLE `__new_design_labels` RENAME TO `design_labels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_notes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer,
	`text` text NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_design_notes`(`seq`, `target_id`, `run_id`, `round`, `text`, `at`) SELECT `seq`, `target_id`, `run_id`, `round`, `text`, `at` FROM `design_notes`;--> statement-breakpoint
DROP TABLE `design_notes`;--> statement-breakpoint
ALTER TABLE `__new_design_notes` RENAME TO `design_notes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;