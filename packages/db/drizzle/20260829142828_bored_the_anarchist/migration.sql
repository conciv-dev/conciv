CREATE TABLE `chat_metadata` (
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	CONSTRAINT `chat_metadata_pk` PRIMARY KEY(`namespace`, `key`)
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`thread_id` text PRIMARY KEY,
	`messages_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
