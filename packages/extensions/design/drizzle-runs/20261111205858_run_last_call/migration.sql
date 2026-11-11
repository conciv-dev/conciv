ALTER TABLE `design_runs` RENAME COLUMN `ended` TO `last_at`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_design_runs` (
	`run_id` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text,
	`model` text,
	`prompt_head` text,
	`started` integer NOT NULL,
	`last_at` integer,
	`cost` real,
	`verdict` text,
	`project_key` text,
	`branch` text,
	`head` text,
	`tools_head` text,
	`tools_version` text,
	`tools_fingerprint` text,
	`session` text,
	`harness` text,
	`agent_id` text,
	`usage` text,
	`error` text,
	`error_code` text,
	`harness_session_id` text,
	CONSTRAINT "runs_verdict" CHECK("verdict" in ('done', 'not-yet', 'stalled', 'unsettled', 'broken'))
);
--> statement-breakpoint
INSERT INTO `__new_design_runs`(`run_id`, `target_id`, `model`, `prompt_head`, `started`, `last_at`, `cost`, `verdict`, `project_key`, `branch`, `head`, `tools_head`, `tools_version`, `tools_fingerprint`, `session`, `harness`, `agent_id`, `usage`, `error`, `error_code`, `harness_session_id`) SELECT `run_id`, `target_id`, `model`, `prompt_head`, `started`, `last_at`, `cost`, `verdict`, `project_key`, `branch`, `head`, `tools_head`, `tools_version`, `tools_fingerprint`, `session`, `harness`, `agent_id`, `usage`, `error`, `error_code`, `harness_session_id` FROM `design_runs`;--> statement-breakpoint
DROP TABLE `design_runs`;--> statement-breakpoint
ALTER TABLE `__new_design_runs` RENAME TO `design_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `runs_by_session` ON `design_runs` (`session`);--> statement-breakpoint
CREATE INDEX `runs_by_harness_session` ON `design_runs` (`harness_session_id`);--> statement-breakpoint
DROP VIEW `run_summary`;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.session, r.model, r.harness, r.agent_id, r.last_at, r.cost, r.usage, r.error, r.error_code,
  r.harness_session_id, (r.last_at - r.started) / 60000.0 AS minutes, r.last_at - r.started AS duration_ms, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check') AS checks
FROM design_runs r
LEFT JOIN design_targets t ON t.run_id = r.run_id
LEFT JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND x.state IN ('measured', 'broken'));