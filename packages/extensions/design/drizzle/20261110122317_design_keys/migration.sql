ALTER TABLE `design_node_components` ADD `run_id` integer;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `source_path` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `source_run_id` integer;--> statement-breakpoint
ALTER TABLE `design_tool_calls` ADD `reply` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_missing` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`kind` text NOT NULL,
	CONSTRAINT "missing_kind" CHECK("kind" in ('missing', 'not_rendered', 'dupe'))
);
--> statement-breakpoint
INSERT INTO `__new_design_missing`(`seq`, `target_id`, `run_id`, `round`, `node`, `kind`) SELECT `seq`, `target_id`, `run_id`, `round`, `node`, `kind` FROM `design_missing`;--> statement-breakpoint
DROP TABLE `design_missing`;--> statement-breakpoint
ALTER TABLE `__new_design_missing` RENAME TO `design_missing`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_rows` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`id` text,
	`node` text NOT NULL,
	`source` text,
	`selector` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`magnitude` text NOT NULL,
	`width` real,
	`text` text NOT NULL,
	`token` text,
	`component` text,
	`specifier` text,
	`kit_token` text,
	`design_token` text,
	`confidence` real,
	`margin` real,
	`repeat` integer DEFAULT 0 NOT NULL,
	`at` integer NOT NULL,
	CONSTRAINT "rows_magnitude" CHECK("magnitude" in ('much', 'noticeably', 'slightly', 'pin', 'other', 'reflow', 'paint', 'token-drift', 'component'))
);
--> statement-breakpoint
INSERT INTO `__new_design_rows`(`seq`, `target_id`, `run_id`, `round`, `id`, `node`, `source`, `selector`, `kind`, `name`, `magnitude`, `width`, `text`, `token`, `component`, `specifier`, `kit_token`, `design_token`, `confidence`, `margin`, `repeat`, `at`) SELECT `seq`, `target_id`, `run_id`, `round`, `id`, `node`, `source`, `selector`, `kind`, `name`, `magnitude`, `width`, `text`, `token`, `component`, `specifier`, `kit_token`, `design_token`, `confidence`, `margin`, `repeat`, `at` FROM `design_rows`;--> statement-breakpoint
DROP TABLE `design_rows`;--> statement-breakpoint
ALTER TABLE `__new_design_rows` RENAME TO `design_rows`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_runs` (
	`run_id` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text,
	`model` text NOT NULL,
	`prompt_head` text NOT NULL,
	`started` integer NOT NULL,
	`ended` integer,
	`cost` real,
	`verdict` text,
	`source_path` text,
	`source_run_id` integer,
	CONSTRAINT "runs_verdict" CHECK("verdict" in ('done', 'not-yet', 'stalled', 'unsettled', 'broken'))
);
--> statement-breakpoint
INSERT INTO `__new_design_runs`(`run_id`, `target_id`, `model`, `prompt_head`, `started`, `ended`, `cost`, `verdict`) SELECT `run_id`, `target_id`, `model`, `prompt_head`, `started`, `ended`, `cost`, `verdict` FROM `design_runs`;--> statement-breakpoint
DROP TABLE `design_runs`;--> statement-breakpoint
ALTER TABLE `__new_design_runs` RENAME TO `design_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_targets` (
	`target_id` text PRIMARY KEY NOT NULL,
	`run_id` integer,
	`session` text NOT NULL,
	`link` text NOT NULL,
	`route` text,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`scale` real NOT NULL,
	`design` text NOT NULL,
	`image` text NOT NULL,
	`widget` text DEFAULT 'hidden' NOT NULL,
	`unsettled` integer DEFAULT 0 NOT NULL,
	`lead` text,
	`at` integer NOT NULL,
	CONSTRAINT "targets_widget" CHECK("widget" in ('hidden', 'shown'))
);
--> statement-breakpoint
INSERT INTO `__new_design_targets`(`target_id`, `run_id`, `session`, `link`, `route`, `width`, `height`, `scale`, `design`, `image`, `widget`, `unsettled`, `lead`, `at`) SELECT `target_id`, `run_id`, `session`, `link`, `route`, `width`, `height`, `scale`, `design`, `image`, `widget`, `unsettled`, `lead`, `at` FROM `design_targets`;--> statement-breakpoint
DROP TABLE `design_targets`;--> statement-breakpoint
ALTER TABLE `__new_design_targets` RENAME TO `design_targets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_tool_calls` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text,
	`run_id` integer,
	`tool` text NOT NULL,
	`round` integer,
	`input` text,
	`reply` text,
	`reply_bytes` integer,
	`duration_ms` integer NOT NULL,
	`error` text,
	`at` integer NOT NULL,
	CONSTRAINT "tool_calls_tool" CHECK("tool" in ('design_get', 'design_check', 'design_status', 'design_measure', 'design_shots', 'design_components'))
);
--> statement-breakpoint
INSERT INTO `__new_design_tool_calls`(`seq`, `target_id`, `run_id`, `tool`, `round`, `input`, `reply_bytes`, `duration_ms`, `error`, `at`) SELECT `seq`, `target_id`, `run_id`, `tool`, `round`, `input`, `reply_bytes`, `duration_ms`, `error`, `at` FROM `design_tool_calls`;--> statement-breakpoint
DROP TABLE `design_tool_calls`;--> statement-breakpoint
ALTER TABLE `__new_design_tool_calls` RENAME TO `design_tool_calls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `missing_by_round` ON `design_missing` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `rows_by_round` ON `design_rows` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `rows_by_node` ON `design_rows` (`target_id`,`node`);--> statement-breakpoint
CREATE UNIQUE INDEX `runs_source` ON `design_runs` (`source_path`,`source_run_id`);--> statement-breakpoint
CREATE INDEX `tool_calls_by_round` ON `design_tool_calls` (`run_id`,`round`);--> statement-breakpoint
CREATE INDEX `candidates_by_round` ON `design_candidates` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `fom_by_round` ON `design_fom` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `fom_by_node` ON `design_fom` (`target_id`,`node`);--> statement-breakpoint
CREATE INDEX `node_components_by_round` ON `design_node_components` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `node_components_by_component` ON `design_node_components` (`component_id`);--> statement-breakpoint
CREATE INDEX `regions_by_round` ON `design_regions` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `rounds_by_round` ON `design_rounds` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `votes_by_round` ON `design_votes` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `widths_by_round` ON `design_widths` (`run_id`,`target_id`,`round`);