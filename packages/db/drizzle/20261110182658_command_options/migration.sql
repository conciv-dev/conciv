ALTER TABLE `commands` ADD `options` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `commands` ADD `scope` text DEFAULT 'project' NOT NULL;