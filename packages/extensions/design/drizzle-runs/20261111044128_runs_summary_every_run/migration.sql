DROP VIEW `judged`;--> statement-breakpoint
DROP VIEW `run_summary`;--> statement-breakpoint
DROP VIEW `wave_summary`;--> statement-breakpoint
CREATE VIEW `judged` AS SELECT s.run_id, r.wave, r.lane, s.arm, s.model, s.harness, s.agent_id, s.status, s.cost, s.usage, s.error,
  s.error_code, s.duration_ms, s.target_id, s.width, s.verdict, s.rows, s.pixels, j.score, j.reason
FROM run_summary s
JOIN design_runs r ON r.run_id = s.run_id
LEFT JOIN design_judgements j ON j.run_id = s.run_id AND j.target_id = s.target_id AND j.width = s.width
WHERE s.round IS NOT NULL;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.wave, r.lane, r.model, r.harness, r.agent_id, r.arm, r.status, r.ended, r.cost, r.usage, r.error, r.error_code,
  (r.ended - r.started) / 60000.0 AS minutes, r.ended - r.started AS duration_ms, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
LEFT JOIN design_targets t ON t.run_id = r.run_id
LEFT JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND (r.ended IS NULL OR x.at <= r.ended));--> statement-breakpoint
CREATE VIEW `wave_summary` AS WITH base AS (
  SELECT r.wave, s.arm, s.width, s.run_id, s.run_verdict, s.rows, s.pixels, s.cost, l.lowest
  FROM run_summary s
  JOIN design_runs r ON r.run_id = s.run_id
  LEFT JOIN lowest_rendered l ON l.run_id = s.run_id AND l.target_id = s.target_id
  WHERE s.round IS NOT NULL
)
SELECT g.wave, g.arm, g.width, count(DISTINCT g.run_id) AS runs,
  count(DISTINCT CASE WHEN g.run_verdict = 'done' THEN g.run_id END) AS done,
  (SELECT avg(v) FROM (SELECT x."rows" AS v, row_number() OVER (ORDER BY x."rows") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."rows" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_rows, (SELECT avg(v) FROM (SELECT x."pixels" AS v, row_number() OVER (ORDER BY x."pixels") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."pixels" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_pixels, (SELECT avg(v) FROM (SELECT x."cost" AS v, row_number() OVER (ORDER BY x."cost") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."cost" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_cost,
  (SELECT avg(v) FROM (SELECT x."lowest" AS v, row_number() OVER (ORDER BY x."lowest") AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x."lowest" IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2)) AS median_lowest_rendered
FROM base g GROUP BY g.wave, g.arm, g.width;