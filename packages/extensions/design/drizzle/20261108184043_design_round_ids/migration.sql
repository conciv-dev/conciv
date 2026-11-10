ALTER TABLE `design_rounds` ADD `ids` text;--> statement-breakpoint
UPDATE `design_rounds` SET `ids` = (SELECT `t`.`ids` FROM `design_targets` `t` WHERE `t`.`target_id` = `design_rounds`.`target_id`) WHERE `seq` IN (SELECT max(`seq`) FROM `design_rounds` GROUP BY `target_id`);--> statement-breakpoint
ALTER TABLE `design_targets` DROP COLUMN `ids`;
