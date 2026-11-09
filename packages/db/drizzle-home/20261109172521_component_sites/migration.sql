CREATE TABLE `component_sites` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`project` text NOT NULL,
	`tree` text NOT NULL,
	`component_id` text NOT NULL,
	`file` text NOT NULL,
	`line` integer NOT NULL
);
