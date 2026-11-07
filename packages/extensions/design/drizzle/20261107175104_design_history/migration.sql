ALTER TABLE `design_fom` ADD `name` text;--> statement-breakpoint
ALTER TABLE `design_fom` ADD `voted_round` integer;--> statement-breakpoint
ALTER TABLE `design_rows` ADD `repeat` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_tool_calls` ADD `round` integer;--> statement-breakpoint
ALTER TABLE `design_votes` ADD `name` text;