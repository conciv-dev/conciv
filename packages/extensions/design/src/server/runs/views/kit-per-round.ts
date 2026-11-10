import {sql} from 'drizzle-orm'
import {integer, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const kitPerRoundView = sqliteView('kit_per_round', {
  run_id: integer().notNull(),
  target_id: text().notNull(),
  round: integer().notNull(),
  component_id: text().notNull(),
  component: text(),
  specifier: text(),
  nodes: integer().notNull(),
}).as(sql`SELECT run_id, target_id, round, component_id, component, specifier, count(DISTINCT node) AS nodes
FROM design_node_components GROUP BY run_id, target_id, round, component_id, component, specifier`)
