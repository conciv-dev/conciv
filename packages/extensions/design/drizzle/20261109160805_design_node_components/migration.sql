CREATE TABLE `design_node_components` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`component_id` text NOT NULL,
	`source` text NOT NULL
);
