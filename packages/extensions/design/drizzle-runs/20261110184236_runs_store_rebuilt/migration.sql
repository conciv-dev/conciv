CREATE TABLE `design_artifacts` (
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
	CONSTRAINT "artifacts_kind" CHECK("kind" in ('design', 'screenshot', 'source', 'transcript', 'report'))
);
--> statement-breakpoint
CREATE TABLE `design_judgements` (
	`run_id` integer NOT NULL,
	`target_id` text NOT NULL,
	`width` real NOT NULL,
	`score` integer NOT NULL,
	`reason` text NOT NULL,
	`judge_model` text NOT NULL,
	`at` integer NOT NULL,
	CONSTRAINT `fk_design_judgements_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT "judgements_score" CHECK("score" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE `design_lanes` (
	`run_id` integer NOT NULL UNIQUE,
	`path` text NOT NULL,
	`registered` integer NOT NULL,
	CONSTRAINT `fk_design_lanes_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_reports` (
	`report_id` integer PRIMARY KEY AUTOINCREMENT,
	`wave` text NOT NULL,
	`artifact_id` integer,
	`queries` text NOT NULL,
	`at` integer NOT NULL,
	CONSTRAINT `fk_design_reports_artifact_id_design_artifacts_artifact_id_fk` FOREIGN KEY (`artifact_id`) REFERENCES `design_artifacts`(`artifact_id`)
);
--> statement-breakpoint
ALTER TABLE `design_runs` ADD `project_key` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `branch` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `head` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `wave` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `lane` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `tools_head` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `tools_version` text;--> statement-breakpoint
ALTER TABLE `design_runs` ADD `tools_fingerprint` text;--> statement-breakpoint
CREATE UNIQUE INDEX `judgements_judge` ON `design_judgements` (`run_id`,`target_id`,`width`,`judge_model`);--> statement-breakpoint
CREATE VIEW `judged` AS SELECT s.run_id, r.wave, r.lane, s.target_id, s.width, s.verdict, s.rows, s.pixels, j.score, j.reason
FROM run_summary s
JOIN design_runs r ON r.run_id = s.run_id
LEFT JOIN design_judgements j ON j.run_id = s.run_id AND j.target_id = s.target_id AND j.width = s.width;--> statement-breakpoint
CREATE VIEW `wave_summary` AS WITH base AS (
  SELECT r.wave, s.width, s.run_id, s.run_verdict, s.rows, s.pixels, s.cost, l.lowest
  FROM run_summary s
  JOIN design_runs r ON r.run_id = s.run_id
  LEFT JOIN lowest_rendered l ON l.run_id = s.run_id AND l.target_id = s.target_id
)
SELECT g.wave, g.width, count(DISTINCT g.run_id) AS runs,
  count(DISTINCT CASE WHEN g.run_verdict = 'done' THEN g.run_id END) AS done,
  (SELECT avg(v) FROM (SELECT x."rows" AS v, row_number() OVER (ORDER BY x."rows") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.width = g.width AND x."rows" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_rows, (SELECT avg(v) FROM (SELECT x."pixels" AS v, row_number() OVER (ORDER BY x."pixels") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.width = g.width AND x."pixels" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_pixels, (SELECT avg(v) FROM (SELECT x."cost" AS v, row_number() OVER (ORDER BY x."cost") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.width = g.width AND x."cost" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_cost,
  (SELECT avg(v) FROM (SELECT x."lowest" AS v, row_number() OVER (ORDER BY x."lowest") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.width = g.width AND x."lowest" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_lowest_rendered
FROM base g GROUP BY g.wave, g.width;