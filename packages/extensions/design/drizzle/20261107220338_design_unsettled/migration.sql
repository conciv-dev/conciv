ALTER TABLE `design_rounds` ADD `verdict` text;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `unsettled` text;--> statement-breakpoint
ALTER TABLE `design_targets` ADD `unsettled` integer DEFAULT 0 NOT NULL;