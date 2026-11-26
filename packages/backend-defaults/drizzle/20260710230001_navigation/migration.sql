CREATE TABLE `navigation` (
	`id` text PRIMARY KEY DEFAULT 'navigation',
	`entries` text NOT NULL,
	`index` integer NOT NULL,
	`updated_at` integer NOT NULL
);
