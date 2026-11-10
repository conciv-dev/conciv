DROP VIEW `mispairs`;--> statement-breakpoint
CREATE VIEW `mispairs` AS WITH ranked AS (
  SELECT run_id, target_id, round, node, path, total, won,
    row_number() OVER (PARTITION BY run_id, target_id, round, node ORDER BY total DESC) AS place
  FROM design_votes
), winners AS (
  SELECT w.run_id, w.target_id, w.round, w.node, w.path, f.total - coalesce(s.total, 0) AS margin
  FROM ranked w
  JOIN ranked f ON f.run_id = w.run_id AND f.target_id = w.target_id AND f.round = w.round
    AND f.node = w.node AND f.place = 1
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
FROM paths WHERE before IS NOT NULL AND before <> path AND margin < 0.08;