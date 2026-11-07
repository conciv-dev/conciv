ALTER TABLE `markers` ADD `after_message_id` text;--> statement-breakpoint
DELETE FROM `markers` WHERE `after_turn` > 0;--> statement-breakpoint
ALTER TABLE `markers` DROP COLUMN `after_turn`;
