import {sql} from 'drizzle-orm'
import {integer, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const hintVsDrawnView = sqliteView('hint_vs_drawn', {
  run_id: integer().notNull(),
  session: text().notNull(),
  target_id: text().notNull(),
  hint_round: integer().notNull(),
  round: integer(),
  node: text().notNull(),
  hint: text().notNull(),
  hint_specifier: text(),
  drawn: text(),
  same: integer().notNull(),
}).as(sql`SELECT h.run_id, h.session, h.target_id, h.round AS hint_round, r.round, h.node, h.hint,
  h.specifier AS hint_specifier, group_concat(DISTINCT nc.component) AS drawn,
  coalesce(max(nc.component = h.hint AND nc.specifier = h.specifier), 0) AS same
FROM design_hints h
LEFT JOIN design_rounds r ON r.run_id = h.run_id AND r.target_id = h.target_id AND r.state = 'measured'
  AND r.round > h.round
LEFT JOIN design_node_components nc ON nc.run_id = h.run_id AND nc.target_id = h.target_id
  AND nc.round = r.round AND nc.node = h.node
GROUP BY h.run_id, h.session, h.target_id, h.round, r.round, h.node, h.hint, h.specifier`)
