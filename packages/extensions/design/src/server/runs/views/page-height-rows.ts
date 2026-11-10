import {sql} from 'drizzle-orm'
import {integer, real, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const pageHeightRowsView = sqliteView('page_height_rows', {
  run_id: integer().notNull(),
  target_id: text().notNull(),
  width: real().notNull(),
  round: integer().notNull(),
  text: text().notNull(),
  last_round: integer().notNull(),
  fixed: integer().notNull(),
}).as(sql`SELECT r.run_id, r.target_id, t.width, r.round, r.text, last.round AS last_round,
  (SELECT max(p.round) FROM design_rows p WHERE p.run_id = r.run_id AND p.target_id = r.target_id AND p.kind = 'page')
    < last.round AS fixed
FROM design_rows r
JOIN design_targets t ON t.run_id = r.run_id AND t.target_id = r.target_id
JOIN (SELECT run_id, target_id, max(round) AS round FROM design_rounds GROUP BY run_id, target_id) last
  ON last.run_id = r.run_id AND last.target_id = r.target_id
WHERE r.kind = 'page'`)
