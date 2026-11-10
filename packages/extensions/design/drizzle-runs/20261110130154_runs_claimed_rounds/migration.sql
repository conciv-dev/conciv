PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_labels` (
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
	CONSTRAINT "verdict" CHECK("verdict" in ('right', 'wrong'))
);
--> statement-breakpoint
INSERT INTO `__new_design_labels`(`seq`, `target_id`, `run_id`, `round`, `node`, `id`, `verdict`, `by`, `note`, `at`) SELECT `seq`, `target_id`, `run_id`, `round`, `node`, `id`, `verdict`, `by`, `note`, `at` FROM `design_labels`;--> statement-breakpoint
DROP TABLE `design_labels`;--> statement-breakpoint
ALTER TABLE `__new_design_labels` RENAME TO `design_labels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_notes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer,
	`text` text NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_design_notes_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_notes_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_design_notes`(`seq`, `target_id`, `run_id`, `round`, `text`, `at`) SELECT `seq`, `target_id`, `run_id`, `round`, `text`, `at` FROM `design_notes`;--> statement-breakpoint
DROP TABLE `design_notes`;--> statement-breakpoint
ALTER TABLE `__new_design_notes` RENAME TO `design_notes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_tool_calls` (
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
	CONSTRAINT "tool_calls_tool" CHECK("tool" in ('design_get', 'design_check', 'design_status', 'design_measure', 'design_shots', 'design_components'))
);
--> statement-breakpoint
INSERT INTO `__new_design_tool_calls`(`seq`, `target_id`, `run_id`, `tool`, `round`, `input`, `reply`, `reply_bytes`, `duration_ms`, `error`, `at`) SELECT `seq`, `target_id`, `run_id`, `tool`, `round`, `input`, `reply`, `reply_bytes`, `duration_ms`, `error`, `at` FROM `design_tool_calls`;--> statement-breakpoint
DROP TABLE `design_tool_calls`;--> statement-breakpoint
ALTER TABLE `__new_design_tool_calls` RENAME TO `design_tool_calls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tool_calls_by_round` ON `design_tool_calls` (`run_id`,`round`);--> statement-breakpoint
DROP VIEW `run_summary`;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.model, r.cost, (r.ended - r.started) / 60000.0 AS minutes, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
JOIN design_targets t ON t.run_id = r.run_id
JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND (r.ended IS NULL OR x.at <= r.ended));