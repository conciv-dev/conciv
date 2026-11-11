CREATE TABLE `design_artifacts` (
	`artifact_id` integer PRIMARY KEY AUTOINCREMENT,
	`run_id` integer NOT NULL,
	`session` text NOT NULL,
	`target_id` text,
	`round` integer,
	`width` real,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`checksum` text NOT NULL,
	`written` integer NOT NULL,
	CONSTRAINT `fk_design_artifacts_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT "artifacts_kind" CHECK("kind" in ('dom', 'cssom', 'fom', 'screenshot', 'diff', 'mask', 'figma', 'design', 'frame', 'source_diff'))
);
--> statement-breakpoint
CREATE TABLE `design_candidates` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text NOT NULL,
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
	`session` text NOT NULL,
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
CREATE TABLE `design_hints` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`hint` text NOT NULL,
	`specifier` text,
	CONSTRAINT `fk_design_hints_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_hints_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_labels` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text,
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
CREATE TABLE `design_missing` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`name` text,
	`kind` text NOT NULL,
	CONSTRAINT `fk_design_missing_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_missing_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_missing_run_id_target_id_round_design_rounds_run_id_target_id_round_fk` FOREIGN KEY (`run_id`,`target_id`,`round`) REFERENCES `design_rounds`(`run_id`,`target_id`,`round`) ON DELETE CASCADE,
	CONSTRAINT "missing_kind" CHECK("kind" in ('missing', 'not_rendered', 'dupe', 'gone'))
);
--> statement-breakpoint
CREATE TABLE `design_node_components` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`session` text NOT NULL,
	`run_id` integer NOT NULL,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`component_id` text NOT NULL,
	`component` text,
	`specifier` text,
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
	`session` text NOT NULL,
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
	`session` text,
	`round` integer,
	`text` text NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_design_notes_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_notes_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `design_regions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text NOT NULL,
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
	`session` text NOT NULL,
	`round` integer NOT NULL,
	`state` text NOT NULL,
	`same_as` integer,
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
	`image_mismatch` text,
	`tree` text DEFAULT '' NOT NULL,
	`verdict` text,
	`unsettled` text,
	`broken` text,
	`broken_by` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_design_rounds_run_id_design_runs_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `design_runs`(`run_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_design_rounds_run_id_target_id_design_targets_run_id_target_id_fk` FOREIGN KEY (`run_id`,`target_id`) REFERENCES `design_targets`(`run_id`,`target_id`) ON DELETE CASCADE,
	CONSTRAINT "rounds_state" CHECK("state" in ('measured', 'unsettled', 'unchanged', 'broken', 'refused'))
);
--> statement-breakpoint
CREATE TABLE `design_rows` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text NOT NULL,
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
	`property` text,
	`expected` text,
	`actual` text,
	`delta` real,
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
	`session` text,
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
	`session` text NOT NULL,
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
CREATE TABLE `design_votes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`session` text NOT NULL,
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
	`session` text NOT NULL,
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
CREATE UNIQUE INDEX `artifacts_path` ON `design_artifacts` (`path`);--> statement-breakpoint
CREATE INDEX `artifacts_by_round` ON `design_artifacts` (`run_id`,`target_id`,`round`,`kind`);--> statement-breakpoint
CREATE INDEX `candidates_by_round` ON `design_candidates` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `fom_by_round` ON `design_fom` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `fom_by_node` ON `design_fom` (`target_id`,`node`);--> statement-breakpoint
CREATE INDEX `hints_by_node` ON `design_hints` (`run_id`,`target_id`,`node`);--> statement-breakpoint
CREATE INDEX `missing_by_round` ON `design_missing` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `node_components_by_round` ON `design_node_components` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `node_components_by_component` ON `design_node_components` (`component_id`);--> statement-breakpoint
CREATE INDEX `regions_by_round` ON `design_regions` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_round` ON `design_rounds` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `rows_by_round` ON `design_rows` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `rows_by_node` ON `design_rows` (`target_id`,`node`);--> statement-breakpoint
CREATE INDEX `runs_by_session` ON `design_runs` (`session`,`status`);--> statement-breakpoint
CREATE INDEX `tool_calls_by_round` ON `design_tool_calls` (`run_id`,`round`);--> statement-breakpoint
CREATE INDEX `votes_by_round` ON `design_votes` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE INDEX `widths_by_round` ON `design_widths` (`run_id`,`target_id`,`round`);--> statement-breakpoint
CREATE VIEW `broken_rounds` AS SELECT b.run_id, b.session, b.target_id, t.width, b.round, b.broken_by, b.broken,
  EXISTS (SELECT 1 FROM design_rounds x WHERE x.run_id = b.run_id AND x.target_id = b.target_id AND x.round > b.round
    AND x.state = 'measured') AS fixed_after
FROM design_rounds b
JOIN design_targets t ON t.run_id = b.run_id AND t.target_id = b.target_id
WHERE b.broken IS NOT NULL;--> statement-breakpoint
CREATE VIEW `fom_nodes` AS SELECT f.seq, f.target_id, f.run_id, f.session, f.id, f.node, f.name, f.instance, f.source, f.site, f.confidence,
  f.margin, f.round, f.voted_round, f.revoted_round, f.reason, f.at, n.type, n.within, n.depth, n.x, n.y, n.w, n.h,
  n.fill_kind, n.fill, n.fill_opacity, n.stroke, n.stroke_weight, n.radius, n.font_family, n.font_weight, n.font_size,
  n.line_height, n.text_align, n.text, n.opacity, n.image, n.asset, n.token_fill, n.token_stroke, n.token_radius,
  n.token_font, n.token_gap, n.token_padding
FROM design_fom f
LEFT JOIN design_nodes n ON n.run_id = f.run_id AND n.target_id = f.target_id AND n.node = f.node;--> statement-breakpoint
CREATE VIEW `hint_vs_drawn` AS SELECT h.run_id, h.session, h.target_id, h.round AS hint_round, r.round, h.node, h.hint,
  h.specifier AS hint_specifier, group_concat(DISTINCT nc.component) AS drawn,
  coalesce(max(nc.component = h.hint AND nc.specifier = h.specifier), 0) AS same
FROM design_hints h
LEFT JOIN design_rounds r ON r.run_id = h.run_id AND r.target_id = h.target_id AND r.state = 'measured'
  AND r.round > h.round
LEFT JOIN design_node_components nc ON nc.run_id = h.run_id AND nc.target_id = h.target_id
  AND nc.round = r.round AND nc.node = h.node
GROUP BY h.run_id, h.session, h.target_id, h.round, r.round, h.node, h.hint, h.specifier;--> statement-breakpoint
CREATE VIEW `kit_per_round` AS SELECT run_id, session, target_id, round, component_id, component, specifier, count(DISTINCT node) AS nodes
FROM design_node_components GROUP BY run_id, session, target_id, round, component_id, component, specifier;--> statement-breakpoint
CREATE VIEW `lost_components` AS SELECT run_id, session, target_id, round, node, component, specifier
FROM design_rows WHERE magnitude = 'component';--> statement-breakpoint
CREATE VIEW `lowest_rendered` AS WITH ranked AS (
  SELECT run_id, session, target_id, round, rendered, nodes,
    row_number() OVER (PARTITION BY run_id, target_id ORDER BY rendered, round) AS low,
    row_number() OVER (PARTITION BY run_id, target_id ORDER BY round DESC) AS late
  FROM design_rounds WHERE nodes > 0 AND state = 'measured'
)
SELECT l.run_id, l.session, l.target_id, t.width, l.rendered AS lowest, l.nodes, l.round, z.rendered AS last_rendered
FROM ranked l
JOIN ranked z ON z.run_id = l.run_id AND z.target_id = l.target_id AND z.late = 1
JOIN design_targets t ON t.run_id = l.run_id AND t.target_id = l.target_id
WHERE l.low = 1;--> statement-breakpoint
CREATE VIEW `mispairs` AS WITH ranked AS (
  SELECT run_id, session, target_id, round, node, path, total, won,
    row_number() OVER (PARTITION BY run_id, target_id, round, node ORDER BY total DESC) AS place
  FROM design_votes
), winners AS (
  SELECT w.run_id, w.session, w.target_id, w.round, w.node, w.path, f.total - coalesce(s.total, 0) AS margin
  FROM ranked w
  JOIN ranked f ON f.run_id = w.run_id AND f.target_id = w.target_id AND f.round = w.round
    AND f.node = w.node AND f.place = 1
  LEFT JOIN ranked s ON s.run_id = w.run_id AND s.target_id = w.target_id AND s.round = w.round
    AND s.node = w.node AND s.place = 2
  WHERE w.won = 1
), paths AS (
  SELECT run_id, session, target_id, node, round, path, margin,
    lag(path) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS before,
    first_value(round) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS first_round,
    first_value(path) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS first_path
  FROM winners
)
SELECT run_id, session, target_id, node, first_round, first_path, round, before, path, margin
FROM paths WHERE before IS NOT NULL AND before <> path AND margin < 0.08;--> statement-breakpoint
CREATE VIEW `page_height_rows` AS SELECT r.run_id, r.session, r.target_id, t.width, r.round, r.text, last.round AS last_round,
  (SELECT max(p.round) FROM design_rows p WHERE p.run_id = r.run_id AND p.target_id = r.target_id AND p.kind = 'page')
    < last.round AS fixed
FROM design_rows r
JOIN design_targets t ON t.run_id = r.run_id AND t.target_id = r.target_id
JOIN (SELECT run_id, target_id, max(round) AS round FROM design_rounds WHERE state = 'measured'
  GROUP BY run_id, target_id) last
  ON last.run_id = r.run_id AND last.target_id = r.target_id
WHERE r.kind = 'page';--> statement-breakpoint
CREATE VIEW `round_rows` AS SELECT run_id, session, target_id, round, kind, magnitude, count(*) AS count
FROM design_rows GROUP BY run_id, session, target_id, round, kind, magnitude;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.session, r.model, r.harness, r.agent_id, r.status, r.ended, r.cost, r.usage, r.error, r.error_code,
  r.harness_session_id, (r.ended - r.started) / 60000.0 AS minutes, r.ended - r.started AS duration_ms, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
LEFT JOIN design_targets t ON t.run_id = r.run_id
LEFT JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND x.state IN ('measured', 'broken') AND (r.ended IS NULL OR x.at <= r.ended));