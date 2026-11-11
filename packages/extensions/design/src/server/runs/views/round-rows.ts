import {sql} from 'drizzle-orm'
import {integer, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const roundRowsView = sqliteView('round_rows', {
  run_id: integer().notNull(),
  session: text().notNull(),
  target_id: text().notNull(),
  round: integer().notNull(),
  kind: text().notNull(),
  magnitude: text().notNull(),
  count: integer().notNull(),
}).as(sql`SELECT run_id, session, target_id, round, kind, magnitude, count(*) AS count
FROM design_rows GROUP BY run_id, session, target_id, round, kind, magnitude`)
