CREATE TABLE `permission` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permission_project_action_resource_idx` ON `permission` (`project_id`,`action`,`resource`);