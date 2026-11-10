import {sql} from 'drizzle-orm'
import {integer, real, sqliteView, text} from 'drizzle-orm/sqlite-core'

export const judgedView = sqliteView('judged', {
  run_id: integer().notNull(),
  wave: text(),
  lane: text(),
  arm: text(),
  model: text(),
  harness: text(),
  agent_id: text(),
  status: text(),
  cost: real(),
  usage: text({mode: 'json'}),
  error: text(),
  error_code: text(),
  duration_ms: integer(),
  target_id: text().notNull(),
  width: real().notNull(),
  verdict: text(),
  rows: integer().notNull(),
  pixels: real(),
  score: integer(),
  reason: text(),
}).as(sql`SELECT s.run_id, r.wave, r.lane, s.arm, s.model, s.harness, s.agent_id, s.status, s.cost, s.usage, s.error,
  s.error_code, s.duration_ms, s.target_id, s.width, s.verdict, s.rows, s.pixels, j.score, j.reason
FROM run_summary s
JOIN design_runs r ON r.run_id = s.run_id
LEFT JOIN design_judgements j ON j.run_id = s.run_id AND j.target_id = s.target_id AND j.width = s.width`)
