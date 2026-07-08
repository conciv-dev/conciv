ALTER TABLE `canvas_draft_elements` ADD `owner_kind` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `canvas_draft_elements` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `canvas_draft_elements` ADD `owner_name` text;--> statement-breakpoint
ALTER TABLE `canvas_draft_elements` ADD `owner_model` text;--> statement-breakpoint
ALTER TABLE `canvas_draft_elements` ADD `last_edited_by_kind` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `canvas_draft_elements` ADD `last_edited_by_id` text;--> statement-breakpoint
ALTER TABLE `canvas_draft_elements` ADD `last_edited_by_name` text;--> statement-breakpoint
ALTER TABLE `canvas_draft_elements` ADD `last_edited_by_model` text;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `owner_kind` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `owner_name` text;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `owner_model` text;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `last_edited_by_kind` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `last_edited_by_id` text;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `last_edited_by_name` text;--> statement-breakpoint
ALTER TABLE `canvas_elements` ADD `last_edited_by_model` text;