ALTER TABLE `design_node_components` ADD `component` text;--> statement-breakpoint
ALTER TABLE `design_node_components` ADD `specifier` text;--> statement-breakpoint
CREATE VIEW `hint_vs_drawn` AS WITH got AS (
  SELECT c.run_id, json_extract(c.reply, '$.target') AS target_id, n.value AS node
  FROM design_tool_calls c, json_each(c.reply, '$.nodes') n
  WHERE c.tool = 'design_get' AND c.reply IS NOT NULL
  UNION ALL
  SELECT c.run_id, json_extract(v.value, '$.target'), n.value
  FROM design_tool_calls c, json_each(c.reply, '$.variants') v, json_each(v.value, '$.nodes') n
  WHERE c.tool = 'design_get' AND c.reply IS NOT NULL
), hints AS (
  SELECT DISTINCT run_id, target_id, json_extract(node, '$.id') AS node,
    json_extract(node, '$.hint.component') AS hint, json_extract(node, '$.hint.specifier') AS hint_specifier
  FROM got WHERE json_extract(node, '$.hint') IS NOT NULL
)
SELECT h.run_id, h.target_id, r.round, h.node, h.hint, h.hint_specifier,
  group_concat(DISTINCT nc.component) AS drawn,
  coalesce(max(nc.component = h.hint AND nc.specifier = h.hint_specifier), 0) AS same
FROM hints h
LEFT JOIN design_rounds r ON r.run_id = h.run_id AND r.target_id = h.target_id
LEFT JOIN design_node_components nc ON nc.run_id = h.run_id AND nc.target_id = h.target_id
  AND nc.round = r.round AND nc.node = h.node
GROUP BY h.run_id, h.target_id, r.round, h.node, h.hint, h.hint_specifier;--> statement-breakpoint
CREATE VIEW `kit_per_round` AS SELECT run_id, target_id, round, component_id, component, specifier, count(DISTINCT node) AS nodes
FROM design_node_components GROUP BY run_id, target_id, round, component_id, component, specifier;--> statement-breakpoint
CREATE VIEW `lost_components` AS SELECT run_id, target_id, round, node, component, specifier
FROM design_rows WHERE magnitude = 'component';--> statement-breakpoint
CREATE VIEW `mispairs` AS WITH ranked AS (
  SELECT run_id, target_id, round, node, path, total, won,
    row_number() OVER (PARTITION BY run_id, target_id, round, node ORDER BY total DESC) AS place
  FROM design_votes
), winners AS (
  SELECT w.run_id, w.target_id, w.round, w.node, w.path, w.total - coalesce(s.total, 0) AS margin
  FROM ranked w
  LEFT JOIN ranked s ON s.run_id = w.run_id AND s.target_id = w.target_id AND s.round = w.round
    AND s.node = w.node AND s.place = 2
  WHERE w.won = 1
), paths AS (
  SELECT run_id, target_id, node, round, path, margin,
    lag(path) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS before,
    first_value(round) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS first_round,
    first_value(path) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS first_path
  FROM winners
)
SELECT run_id, target_id, node, first_round, first_path, round, before, path, margin
FROM paths WHERE before IS NOT NULL AND before <> path AND margin < 0.08;--> statement-breakpoint
CREATE VIEW `round_rows` AS SELECT run_id, target_id, round, kind, magnitude, count(*) AS count
FROM design_rows GROUP BY run_id, target_id, round, kind, magnitude;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.model, r.cost, (r.ended - r.started) / 60000.0 AS minutes, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
JOIN design_targets t ON t.run_id = r.run_id
JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id);