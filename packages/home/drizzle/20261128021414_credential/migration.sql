CREATE TABLE `credential` (
	`id` text PRIMARY KEY,
	`integration_id` text,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`connector_id` text,
	`method_id` text,
	`active` integer,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
