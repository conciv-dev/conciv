CREATE TABLE `engines` (
	`id` text PRIMARY KEY,
	`pid` integer NOT NULL,
	`root` text NOT NULL,
	`api_base` text NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `hub_connections` (
	`harness` text PRIMARY KEY,
	`connected_at` integer NOT NULL
);
