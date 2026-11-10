CREATE TABLE `design_candidates` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`selector` text NOT NULL,
	`score` real NOT NULL,
	CONSTRAINT `fk_design_candidates_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_candidates_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_candidates_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_fom` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`id` text NOT NULL,
	`node` text NOT NULL,
	`name` text,
	`instance` text,
	`source` text,
	`site` text,
	`confidence` real NOT NULL,
	`margin` real NOT NULL,
	`round` integer NOT NULL,
	`voted_round` integer,
	`revoted_round` integer,
	`reason` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_design_fom_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_fom_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_fom_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_labels` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer,
	`node` text NOT NULL,
	`id` text,
	`verdict` text NOT NULL,
	`by` text NOT NULL,
	`note` text,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_design_labels_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_labels_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_labels_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE,
	CONSTRAINT "verdict" CHECK("verdict" in ('right', 'wrong'))
);
--> statement-breakpoint
CREATE TABLE `design_missing` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`kind` text NOT NULL,
	CONSTRAINT `fk_design_missing_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_missing_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_missing_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE,
	CONSTRAINT "missing_kind" CHECK("kind" in ('missing', 'not_rendered', 'dupe'))
);
--> statement-breakpoint
CREATE TABLE `design_node_components` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`component_id` text NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT `fk_design_node_components_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_node_components_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_node_components_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_nodes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`node` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`within` text,
	`depth` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`w` real NOT NULL,
	`h` real NOT NULL,
	`fill_kind` text NOT NULL,
	`fill` text,
	`fill_opacity` real,
	`stroke` text,
	`stroke_weight` real,
	`radius` real,
	`font_family` text,
	`font_weight` real,
	`font_size` real,
	`line_height` real,
	`text_align` text,
	`text` text,
	`opacity` real,
	`image` integer NOT NULL,
	`asset` text,
	`token_fill` text,
	`token_stroke` text,
	`token_radius` text,
	`token_font` text,
	`token_gap` text,
	`token_padding` text,
	CONSTRAINT `fk_design_nodes_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_nodes_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_notes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer,
	`text` text NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_design_notes_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_notes_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_notes_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_regions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`id` text,
	`node` text,
	`name` text,
	`source` text,
	`overlap` real,
	`truncated` integer NOT NULL,
	CONSTRAINT `fk_design_regions_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_regions_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_regions_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_rounds` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`much` integer DEFAULT 0 NOT NULL,
	`noticeably` integer DEFAULT 0 NOT NULL,
	`slightly` integer DEFAULT 0 NOT NULL,
	`pins` integer DEFAULT 0 NOT NULL,
	`other` integer DEFAULT 0 NOT NULL,
	`reflow` integer DEFAULT 0 NOT NULL,
	`paint` integer DEFAULT 0 NOT NULL,
	`drift` integer DEFAULT 0 NOT NULL,
	`rows_count` integer DEFAULT 0 NOT NULL,
	`nodes` integer DEFAULT 0 NOT NULL,
	`mapped` integer DEFAULT 0 NOT NULL,
	`rendered` integer DEFAULT 0 NOT NULL,
	`revoted` integer DEFAULT 0 NOT NULL,
	`pixel_share` real,
	`pixel_before` real,
	`closed` integer,
	`opened` integer,
	`kept` integer,
	`gained` integer,
	`lost` integer,
	`changed_ratio` real,
	`changed_regions` integer,
	`note` text,
	`tree` text NOT NULL,
	`verdict` text,
	`unsettled` text,
	`broken` text,
	`live` text,
	`diff` text,
	`ids` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_design_rounds_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_rounds_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_rows` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
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
	CONSTRAINT `fk_design_rows_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_rows_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_rows_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE,
	CONSTRAINT "rows_magnitude" CHECK("magnitude" in ('much', 'noticeably', 'slightly', 'pin', 'other', 'reflow', 'paint', 'token-drift', 'component'))
);
--> statement-breakpoint
CREATE TABLE `design_runs` (
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
CREATE TABLE `design_targets` (
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
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
	CONSTRAINT `design_targets_pk` PRIMARY KEY(`run_id`, `target_id`),
	CONSTRAINT `fk_design_targets_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT "targets_widget" CHECK("widget" in ('hidden', 'shown'))
);
--> statement-breakpoint
CREATE TABLE `design_tool_calls` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text,
	`run_id` integer NOT NULL,
	`tool` text NOT NULL,
	`round` integer,
	`input` text,
	`reply` text,
	`reply_bytes` integer,
	`duration_ms` integer NOT NULL,
	`error` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_design_tool_calls_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_tool_calls_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_tool_calls_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE,
	CONSTRAINT "tool_calls_tool" CHECK("tool" in ('design_get', 'design_check', 'design_status', 'design_measure', 'design_shots', 'design_components'))
);
--> statement-breakpoint
CREATE TABLE `design_votes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`name` text,
	`candidate` text NOT NULL,
	`path` text NOT NULL,
	`dom` real NOT NULL,
	`src` real NOT NULL,
	`cssom` real NOT NULL,
	`total` real NOT NULL,
	`won` integer NOT NULL,
	`at` integer NOT NULL,
	CONSTRAINT `fk_design_votes_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_votes_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_votes_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_widths` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`width` real NOT NULL,
	`from` text NOT NULL,
	`root_height` real NOT NULL,
	`overflow_x` integer NOT NULL,
	CONSTRAINT `fk_design_widths_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_widths_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_widths_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `candidates_by_round` ON `design_candidates` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `fom_by_round` ON `design_fom` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `fom_by_node` ON `design_fom` (`target_id`,`node`);--> statement-breakpoint
CREATE INDEX `missing_by_round` ON `design_missing` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `node_components_by_round` ON `design_node_components` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `node_components_by_component` ON `design_node_components` (`component_id`);--> statement-breakpoint
CREATE INDEX `regions_by_round` ON `design_regions` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_round` ON `design_rounds` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `rows_by_round` ON `design_rows` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `rows_by_node` ON `design_rows` (`target_id`,`node`);--> statement-breakpoint
CREATE UNIQUE INDEX `runs_source` ON `design_runs` (`source_path`,`source_run_id`);--> statement-breakpoint
CREATE INDEX `tool_calls_by_round` ON `design_tool_calls` (`run_id`,`round`);--> statement-breakpoint
CREATE INDEX `votes_by_round` ON `design_votes` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `widths_by_round` ON `design_widths` (`run_id`,`target_id`,`round`);