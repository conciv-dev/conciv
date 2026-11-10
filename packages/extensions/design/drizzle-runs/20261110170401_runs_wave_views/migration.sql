CREATE VIEW `broken_rounds` AS SELECT b.run_id, b.target_id, t.width, b.round, b.broken_by, b.broken,
  EXISTS (SELECT 1 FROM design_rounds x WHERE x.run_id = b.run_id AND x.target_id = b.target_id AND x.round > b.round
    AND x.broken IS NULL) AS fixed_after
FROM design_rounds b
JOIN design_targets t ON t.run_id = b.run_id AND t.target_id = b.target_id
WHERE b.broken IS NOT NULL;--> statement-breakpoint
CREATE VIEW `lowest_rendered` AS WITH ranked AS (
  SELECT run_id, target_id, round, rendered, nodes,
    row_number() OVER (PARTITION BY run_id, target_id ORDER BY rendered, round) AS low,
    row_number() OVER (PARTITION BY run_id, target_id ORDER BY round DESC) AS late
  FROM design_rounds WHERE nodes > 0
)
SELECT l.run_id, l.target_id, t.width, l.rendered AS lowest, l.nodes, l.round, z.rendered AS last_rendered
FROM ranked l
JOIN ranked z ON z.run_id = l.run_id AND z.target_id = l.target_id AND z.late = 1
JOIN design_targets t ON t.run_id = l.run_id AND t.target_id = l.target_id
WHERE l.low = 1;--> statement-breakpoint
CREATE VIEW `page_height_rows` AS SELECT r.run_id, r.target_id, t.width, r.round, r.text, last.round AS last_round,
  (SELECT max(p.round) FROM design_rows p WHERE p.run_id = r.run_id AND p.target_id = r.target_id AND p.kind = 'page')
    < last.round AS fixed
FROM design_rows r
JOIN design_targets t ON t.run_id = r.run_id AND t.target_id = r.target_id
JOIN (SELECT run_id, target_id, max(round) AS round FROM design_rounds GROUP BY run_id, target_id) last
  ON last.run_id = r.run_id AND last.target_id = r.target_id
WHERE r.kind = 'page';