import {sql} from 'drizzle-orm'
import {integer, real, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const lowestRenderedView = sqliteView('lowest_rendered', {
  run_id: integer().notNull(),
  target_id: text().notNull(),
  width: real().notNull(),
  lowest: integer().notNull(),
  nodes: integer().notNull(),
  round: integer().notNull(),
  last_rendered: integer().notNull(),
}).as(sql`WITH ranked AS (
  SELECT run_id, target_id, round, rendered, nodes,
    row_number() OVER (PARTITION BY run_id, target_id ORDER BY rendered, round) AS low,
    row_number() OVER (PARTITION BY run_id, target_id ORDER BY round DESC) AS late
  FROM design_rounds WHERE nodes > 0
)
SELECT l.run_id, l.target_id, t.width, l.rendered AS lowest, l.nodes, l.round, z.rendered AS last_rendered
FROM ranked l
JOIN ranked z ON z.run_id = l.run_id AND z.target_id = l.target_id AND z.late = 1
JOIN design_targets t ON t.run_id = l.run_id AND t.target_id = l.target_id
WHERE l.low = 1`)
