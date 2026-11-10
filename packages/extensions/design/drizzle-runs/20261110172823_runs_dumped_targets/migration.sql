CREATE TABLE `__new_design_targets` (
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text,
	`link` text,
	`route` text,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`scale` real,
	`design` text,
	`image` text,
	`widget` text DEFAULT 'hidden' NOT NULL,
	`unsettled` integer DEFAULT 0 NOT NULL,
	`lead` text,
	`at` integer,
	CONSTRAINT `design_targets_pk` PRIMARY KEY(`run_id`, `target_id`),
	CONSTRAINT `fk_design_targets_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT "targets_widget" CHECK("widget" in ('hidden', 'shown'))
);
--> statement-breakpoint
INSERT INTO `__new_design_targets` (`target_id`, `run_id`, `session`, `link`, `route`, `width`, `height`, `scale`, `design`, `image`, `widget`, `unsettled`, `lead`, `at`) SELECT `target_id`, `run_id`, `session`, `link`, `route`, `width`, `height`, `scale`, `design`, `image`, `widget`, `unsettled`, `lead`, `at` FROM `design_targets`;
--> statement-breakpoint
DROP TABLE `design_targets`;
--> statement-breakpoint
ALTER TABLE `__new_design_targets` RENAME TO `design_targets`;
