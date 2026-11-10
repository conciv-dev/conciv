ALTER TABLE `design_runs` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `status` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `arm` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `harness` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `agent_id` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `usage` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `error` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `error_code` text;--> statement-breakpoint
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
	`wave` text,
	`lane` text,
	`tools_head` text,
	`tools_version` text,
	`tools_fingerprint` text,
	`source_path` text,
	`source_run_id` integer,
	`session_id` text,
	`status` text,
	`arm` text,
	`harness` text,
	`agent_id` text,
	`usage` text,
	`error` text,
	`error_code` text,
	CONSTRAINT "runs_verdict" CHECK("verdict" in ('done', 'not-yet', 'stalled', 'unsettled', 'broken')),
	CONSTRAINT "runs_status" CHECK("status" in ('running', 'interrupted', 'completed', 'failed', 'aborted')),
	CONSTRAINT "runs_arm" CHECK("arm" in ('tools', 'control'))
);
--> statement-breakpoint
INSERT INTO `__new_design_runs`(`run_id`, `target_id`, `model`, `prompt_head`, `started`, `ended`, `cost`, `verdict`, `project_key`, `branch`, `head`, `wave`, `lane`, `tools_head`, `tools_version`, `tools_fingerprint`, `source_path`, `source_run_id`) SELECT `run_id`, `target_id`, `model`, `prompt_head`, `started`, `ended`, `cost`, `verdict`, `project_key`, `branch`, `head`, `wave`, `lane`, `tools_head`, `tools_version`, `tools_fingerprint`, `source_path`, `source_run_id` FROM `design_runs`;--> statement-breakpoint
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
	`lifetime` text NOT NULL,
	`written` integer NOT NULL,
	CONSTRAINT `fk_design_artifacts_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT "artifacts_kind" CHECK("kind" in ('design', 'screenshot', 'source', 'transcript', 'report', 'source_diff'))
);
--> statement-breakpoint
INSERT INTO `__new_design_artifacts`(`artifact_id`, `run_id`, `kind`, `width`, `path`, `size`, `checksum`, `lifetime`, `written`) SELECT `artifact_id`, `run_id`, `kind`, `width`, `path`, `size`, `checksum`, `lifetime`, `written` FROM `design_artifacts`;--> statement-breakpoint
DROP TABLE `design_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_design_artifacts` RENAME TO `design_artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `runs_source` ON `design_runs` (`source_path`,`source_run_id`);--> statement-breakpoint
CREATE INDEX `runs_by_session` ON `design_runs` (`session_id`,`status`);--> statement-breakpoint
DROP TABLE `design_lanes`;--> statement-breakpoint
DROP VIEW `judged`;--> statement-breakpoint
DROP VIEW `run_summary`;--> statement-breakpoint
DROP VIEW `wave_summary`;--> statement-breakpoint
CREATE VIEW `fom_nodes` AS SELECT f.seq, f.target_id, f.run_id, f.id, f.node, f.name, f.instance, f.source, f.site, f.confidence,
  f.margin, f.round, f.voted_round, f.revoted_round, f.reason, f.at, n.type, n.within, n.depth, n.x, n.y, n.w, n.h,
  n.fill_kind, n.fill, n.fill_opacity, n.stroke, n.stroke_weight, n.radius, n.font_family, n.font_weight, n.font_size,
  n.line_height, n.text_align, n.text, n.opacity, n.image, n.asset, n.token_fill, n.token_stroke, n.token_radius,
  n.token_font, n.token_gap, n.token_padding
FROM design_fom f
LEFT JOIN design_nodes n ON n.run_id = f.run_id AND n.target_id = f.target_id AND n.node = f.node;--> statement-breakpoint
CREATE VIEW `judged` AS SELECT s.run_id, r.wave, r.lane, s.arm, s.model, s.harness, s.agent_id, s.status, s.cost, s.usage, s.error,
  s.error_code, s.duration_ms, s.target_id, s.width, s.verdict, s.rows, s.pixels, j.score, j.reason
FROM run_summary s
JOIN design_runs r ON r.run_id = s.run_id
LEFT JOIN design_judgements j ON j.run_id = s.run_id AND j.target_id = s.target_id AND j.width = s.width;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.model, r.harness, r.agent_id, r.arm, r.status, r.cost, r.usage, r.error, r.error_code,
  (r.ended - r.started) / 60000.0 AS minutes, r.ended - r.started AS duration_ms, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
JOIN design_targets t ON t.run_id = r.run_id
JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND (r.ended IS NULL OR x.at <= r.ended));--> statement-breakpoint
CREATE VIEW `wave_summary` AS WITH base AS (
  SELECT r.wave, s.arm, s.width, s.run_id, s.run_verdict, s.rows, s.pixels, s.cost, l.lowest
  FROM run_summary s
  JOIN design_runs r ON r.run_id = s.run_id
  LEFT JOIN lowest_rendered l ON l.run_id = s.run_id AND l.target_id = s.target_id
)
SELECT g.wave, g.arm, g.width, count(DISTINCT g.run_id) AS runs,
  count(DISTINCT CASE WHEN g.run_verdict = 'done' THEN g.run_id END) AS done,
  (SELECT avg(v) FROM (SELECT x."rows" AS v, row_number() OVER (ORDER BY x."rows") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."rows" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_rows, (SELECT avg(v) FROM (SELECT x."pixels" AS v, row_number() OVER (ORDER BY x."pixels") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."pixels" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_pixels, (SELECT avg(v) FROM (SELECT x."cost" AS v, row_number() OVER (ORDER BY x."cost") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."cost" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_cost,
  (SELECT avg(v) FROM (SELECT x."lowest" AS v, row_number() OVER (ORDER BY x."lowest") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."lowest" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_lowest_rendered
FROM base g GROUP BY g.wave, g.arm, g.width;--> statement-breakpoint
UPDATE `design_runs` SET `status` = CASE WHEN `ended` IS NULL THEN 'aborted' ELSE 'completed' END WHERE `status` IS NULL;