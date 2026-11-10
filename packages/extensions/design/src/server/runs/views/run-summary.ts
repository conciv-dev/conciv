import {sql} from 'drizzle-orm'
import {integer, real, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const runSummaryView = sqliteView('run_summary', {
  run_id: integer().notNull(),
  model: text(),
  harness: text(),
  agent_id: text(),
  arm: text(),
  status: text(),
  cost: real(),
  usage: text({mode: 'json'}),
  error: text(),
  error_code: text(),
  minutes: real(),
  duration_ms: integer(),
  run_verdict: text(),
  target_id: text().notNull(),
  width: real().notNull(),
  round: integer().notNull(),
  verdict: text(),
  rows: integer().notNull(),
  much: integer().notNull(),
  noticeably: integer().notNull(),
  slightly: integer().notNull(),
  reflow: integer().notNull(),
  paint: integer().notNull(),
  pixels: real(),
  checks: integer().notNull(),
}).as(sql`SELECT r.run_id, r.model, r.harness, r.agent_id, r.arm, r.status, r.cost, r.usage, r.error, r.error_code,
  (r.ended - r.started) / 60000.0 AS minutes, r.ended - r.started AS duration_ms, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
JOIN design_targets t ON t.run_id = r.run_id
JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND (r.ended IS NULL OR x.at <= r.ended))`)
