ALTER TABLE `design_runs` ADD `harness_session_id` text;--> statement-breakpoint
DROP VIEW `run_summary`;--> statement-breakpoint
CREATE VIEW `run_summary` AS SELECT r.run_id, r.wave, r.lane, r.model, r.harness, r.agent_id, r.arm, r.status, r.ended, r.cost, r.usage, r.error, r.error_code,
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