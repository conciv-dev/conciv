CREATE TABLE `chat_messages` (
	`thread_id` text NOT NULL,
	`position` integer NOT NULL,
	`message_id` text,
	`role` text NOT NULL,
	`message_json` text NOT NULL,
	CONSTRAINT `chat_messages_pk` PRIMARY KEY(`thread_id`, `position`)
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_message` ON `chat_messages` (`thread_id`,`message_id`);--> statement-breakpoint
INSERT INTO `chat_messages` (`thread_id`, `position`, `message_id`, `role`, `message_json`) SELECT `chat_threads`.`thread_id`, CAST(`message`.`key` AS INTEGER), json_extract(`message`.`value`, '$.id'), json_extract(`message`.`value`, '$.role'), `message`.`value` FROM `chat_threads`, json_each(`chat_threads`.`messages_json`) AS `message`;
