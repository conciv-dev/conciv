PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_runs` (
	`run_id` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text,
	`model` text,
	`prompt_head` text,
	`started` integer NOT NULL,
	`ended` integer,
	`cost` real,
	`verdict` text,
	`project_key` text,
	`branch` text,
	`head` text,
	`tools_head` text,
	`tools_version` text,
	`tools_fingerprint` text,
	`session_id` text,
	`status` text,
	`harness` text,
	`agent_id` text,
	`usage` text,
	`error` text,
	`error_code` text,
	`harness_session_id` text,
	CONSTRAINT "runs_verdict" CHECK("verdict" in ('done', 'not-yet', 'stalled', 'unsettled', 'broken')),
	CONSTRAINT "runs_status" CHECK("status" in ('running', 'interrupted', 'completed', 'failed', 'aborted'))
);
--> statement-breakpoint
INSERT INTO `__new_design_runs`(`run_id`, `target_id`, `model`, `prompt_head`, `started`, `ended`, `cost`, `verdict`, `project_key`, `branch`, `head`, `tools_head`, `tools_version`, `tools_fingerprint`, `session_id`, `status`, `harness`, `agent_id`, `usage`, `error`, `error_code`, `harness_session_id`) SELECT `run_id`, `target_id`, `model`, `prompt_head`, `started`, `ended`, `cost`, `verdict`, `project_key`, `branch`, `head`, `tools_head`, `tools_version`, `tools_fingerprint`, `session_id`, `status`, `harness`, `agent_id`, `usage`, `error`, `error_code`, `harness_session_id` FROM `design_runs`;--> statement-breakpoint
DROP TABLE `design_runs`;--> statement-breakpoint
ALTER TABLE `__new_design_runs` RENAME TO `design_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_artifacts` (
	`artifact_id` integer PRIMARY KEY AUTOINCREMENT,
	`run_id` integer,
	`kind` text NOT NULL,
	`width` real,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`checksum` text NOT NULL,
	`written` integer NOT NULL,
	CONSTRAINT `fk_design_artifacts_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT "artifacts_kind" CHECK("kind" in ('design', 'screenshot', 'source', 'transcript', 'source_diff'))
);
--> statement-breakpoint
INSERT INTO `__new_design_artifacts`(`artifact_id`, `run_id`, `kind`, `width`, `path`, `size`, `checksum`, `written`) SELECT `artifact_id`, `run_id`, `kind`, `width`, `path`, `size`, `checksum`, `written` FROM `design_artifacts`;--> statement-breakpoint
DROP TABLE `design_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_design_artifacts` RENAME TO `design_artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `judgements_judge`;--> statement-breakpoint
DROP INDEX IF EXISTS `runs_source`;--> statement-breakpoint
CREATE INDEX `runs_by_session` ON `design_runs` (`session_id`,`status`);--> statement-breakpoint
DROP TABLE `design_judgements`;--> statement-breakpoint
DROP TABLE `design_reports`;--> statement-breakpoint
DROP VIEW `judged`;--> statement-breakpoint
DROP VIEW `wave_summary`;--> statement-breakpoint
DROP VIEW `run_summary`;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.model, r.harness, r.agent_id, r.status, r.ended, r.cost, r.usage, r.error, r.error_code,
  r.harness_session_id, (r.ended - r.started) / 60000.0 AS minutes, r.ended - r.started AS duration_ms, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
LEFT JOIN design_targets t ON t.run_id = r.run_id
LEFT JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND (r.ended IS NULL OR x.at <= r.ended));