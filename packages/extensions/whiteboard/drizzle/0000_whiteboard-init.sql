CREATE TABLE `canvas_draft_elements` (
	`room` text NOT NULL,
	`element_id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	PRIMARY KEY(`room`, `element_id`)
);
--> statement-breakpoint
CREATE TABLE `canvas_elements` (
	`room` text NOT NULL,
	`element_id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	PRIMARY KEY(`room`, `element_id`)
);
--> statement-breakpoint
CREATE TABLE `canvas_pending` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`kind` text NOT NULL,
	`stage` text DEFAULT 'live' NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `canvas_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`cid` text NOT NULL,
	`thread_id` text NOT NULL,
	`parent_id` text,
	`parts` text NOT NULL,
	`author_kind` text NOT NULL,
	`author_model` text,
	`author_id` text,
	`author_name` text,
	`author_avatar` text,
	`status` text DEFAULT 'open' NOT NULL,
	`kind` text NOT NULL,
	`anchor` text,
	`anchor_file` text,
	`anchor_component` text,
	`anchor_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `pins` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`cid` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`element_id` text,
	`pin_state` text DEFAULT 'locked' NOT NULL,
	`anchor_x` real,
	`anchor_y` real
);
--> statement-breakpoint
CREATE TABLE `reads` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`account_id` text NOT NULL,
	`last_read_at` integer NOT NULL
);
