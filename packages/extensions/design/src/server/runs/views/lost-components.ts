import {sql} from 'drizzle-orm'
import {integer, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const lostComponentsView = sqliteView('lost_components', {
  run_id: integer().notNull(),
  target_id: text().notNull(),
  round: integer().notNull(),
  node: text().notNull(),
  component: text(),
  specifier: text(),
}).as(sql`SELECT run_id, target_id, round, node, component, specifier
FROM design_rows WHERE magnitude = 'component'`)
