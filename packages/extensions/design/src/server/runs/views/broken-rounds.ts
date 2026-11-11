import {sql} from 'drizzle-orm'
import {integer, real, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const brokenRoundsView = sqliteView('broken_rounds', {
  run_id: integer().notNull(),
  session: text().notNull(),
  target_id: text().notNull(),
  width: real().notNull(),
  round: integer().notNull(),
  broken_by: text(),
  broken: text().notNull(),
  fixed_after: integer().notNull(),
}).as(sql`SELECT b.run_id, b.session, b.target_id, t.width, b.round, b.broken_by, b.broken,
  EXISTS (SELECT 1 FROM design_rounds x WHERE x.run_id = b.run_id AND x.target_id = b.target_id AND x.round > b.round
    AND x.state = 'measured') AS fixed_after
FROM design_rounds b
JOIN design_targets t ON t.run_id = b.run_id AND t.target_id = b.target_id
WHERE b.broken IS NOT NULL`)
