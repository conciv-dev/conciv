CREATE TABLE `kv` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
