CREATE TABLE `whiteboard_changes` (
	`room` text NOT NULL,
	`sequence` integer NOT NULL,
	`table` text NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	PRIMARY KEY(`room`, `sequence`)
);
