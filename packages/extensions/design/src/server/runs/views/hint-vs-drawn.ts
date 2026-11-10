import {sql} from 'drizzle-orm'
import {integer, text, sqliteView} from 'drizzle-orm/sqlite-core'

export const hintVsDrawnView = sqliteView('hint_vs_drawn', {
  run_id: integer().notNull(),
  target_id: text().notNull(),
  round: integer(),
  node: text().notNull(),
  hint: text().notNull(),
  hint_specifier: text(),
  drawn: text(),
  same: integer().notNull(),
}).as(sql`WITH got AS (
  SELECT c.run_id, json_extract(c.reply, '$.target') AS target_id, n.value AS node
  FROM design_tool_calls c, json_each(c.reply, '$.nodes') n
  WHERE c.tool = 'design_get' AND c.reply IS NOT NULL
  UNION ALL
  SELECT c.run_id, json_extract(v.value, '$.target'), n.value
  FROM design_tool_calls c, json_each(c.reply, '$.variants') v, json_each(v.value, '$.nodes') n
  WHERE c.tool = 'design_get' AND c.reply IS NOT NULL
), hints AS (
  SELECT DISTINCT run_id, target_id, json_extract(node, '$.id') AS node,
    json_extract(node, '$.hint.component') AS hint, json_extract(node, '$.hint.specifier') AS hint_specifier
  FROM got WHERE json_extract(node, '$.hint') IS NOT NULL
)
SELECT h.run_id, h.target_id, r.round, h.node, h.hint, h.hint_specifier,
  group_concat(DISTINCT nc.component) AS drawn,
  coalesce(max(nc.component = h.hint AND nc.specifier = h.hint_specifier), 0) AS same
FROM hints h
LEFT JOIN design_rounds r ON r.run_id = h.run_id AND r.target_id = h.target_id
LEFT JOIN design_node_components nc ON nc.run_id = h.run_id AND nc.target_id = h.target_id
  AND nc.round = r.round AND nc.node = h.node
GROUP BY h.run_id, h.target_id, r.round, h.node, h.hint, h.hint_specifier`)
