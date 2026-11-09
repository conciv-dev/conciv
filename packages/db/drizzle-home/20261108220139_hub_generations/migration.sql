CREATE TABLE `hub_operations` (
	`harness` text PRIMARY KEY,
	`pid` integer NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_revocations` (
	`generation` integer PRIMARY KEY AUTOINCREMENT
);
