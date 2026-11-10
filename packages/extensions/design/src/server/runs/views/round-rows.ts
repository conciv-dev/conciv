import {sql} from 'drizzle-orm'
import {integer, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const roundRowsView = sqliteView('round_rows', {
  run_id: integer().notNull(),
  target_id: text().notNull(),
  round: integer().notNull(),
  kind: text().notNull(),
  magnitude: text().notNull(),
  count: integer().notNull(),
}).as(sql`SELECT run_id, target_id, round, kind, magnitude, count(*) AS count
FROM design_rows GROUP BY run_id, target_id, round, kind, magnitude`)
