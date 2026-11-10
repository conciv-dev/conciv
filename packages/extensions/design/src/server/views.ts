import {sql} from 'drizzle-orm'
import {integer, real, sqliteView, text} from 'drizzle-orm/sqlite-core'
import {designConfig} from '../shared/tolerances.js'

const PAIR_MARGIN = sql.raw(String(designConfig.tolerances.pairMargin))

export const runsViews = {
  run_summary: sqliteView('run_summary', {
    run_id: integer().notNull(),
    model: text().notNull(),
    cost: real(),
    minutes: real(),
    run_verdict: text(),
    target_id: text().notNull(),
    width: real().notNull(),
    round: integer().notNull(),
    verdict: text(),
    rows: integer().notNull(),
    much: integer().notNull(),
    noticeably: integer().notNull(),
    slightly: integer().notNull(),
    reflow: integer().notNull(),
    paint: integer().notNull(),
    pixels: real(),
    checks: integer().notNull(),
  }).as(sql`SELECT r.run_id, r.model, r.cost, (r.ended - r.started) / 60000.0 AS minutes, r.verdict AS run_verdict,
  t.target_id, t.width, last.round, last.verdict, last.rows_count AS rows, last.much, last.noticeably, last.slightly,
  last.reflow, last.paint, last.pixel_share AS pixels,
  (SELECT count(*) FROM design_tool_calls c
    WHERE c.run_id = r.run_id AND c.tool = 'design_check' AND (r.ended IS NULL OR c.at <= r.ended)) AS checks
FROM design_runs r
JOIN design_targets t ON t.run_id = r.run_id
JOIN design_rounds last ON last.run_id = t.run_id AND last.target_id = t.target_id
  AND last.round = (SELECT max(x.round) FROM design_rounds x WHERE x.run_id = t.run_id AND x.target_id = t.target_id
    AND (r.ended IS NULL OR x.at <= r.ended))`),
  round_rows: sqliteView('round_rows', {
    run_id: integer().notNull(),
    target_id: text().notNull(),
    round: integer().notNull(),
    kind: text().notNull(),
    magnitude: text().notNull(),
    count: integer().notNull(),
  }).as(sql`SELECT run_id, target_id, round, kind, magnitude, count(*) AS count
FROM design_rows GROUP BY run_id, target_id, round, kind, magnitude`),
  hint_vs_drawn: sqliteView('hint_vs_drawn', {
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
GROUP BY h.run_id, h.target_id, r.round, h.node, h.hint, h.hint_specifier`),
  kit_per_round: sqliteView('kit_per_round', {
    run_id: integer().notNull(),
    target_id: text().notNull(),
    round: integer().notNull(),
    component_id: text().notNull(),
    component: text(),
    specifier: text(),
    nodes: integer().notNull(),
  }).as(sql`SELECT run_id, target_id, round, component_id, component, specifier, count(DISTINCT node) AS nodes
FROM design_node_components GROUP BY run_id, target_id, round, component_id, component, specifier`),
  mispairs: sqliteView('mispairs', {
    run_id: integer().notNull(),
    target_id: text().notNull(),
    node: text().notNull(),
    first_round: integer().notNull(),
    first_path: text().notNull(),
    round: integer().notNull(),
    before: text().notNull(),
    path: text().notNull(),
    margin: real().notNull(),
  }).as(sql`WITH ranked AS (
  SELECT run_id, target_id, round, node, path, total, won,
    row_number() OVER (PARTITION BY run_id, target_id, round, node ORDER BY total DESC) AS place
  FROM design_votes
), winners AS (
  SELECT w.run_id, w.target_id, w.round, w.node, w.path, w.total - coalesce(s.total, 0) AS margin
  FROM ranked w
  LEFT JOIN ranked s ON s.run_id = w.run_id AND s.target_id = w.target_id AND s.round = w.round
    AND s.node = w.node AND s.place = 2
  WHERE w.won = 1
), paths AS (
  SELECT run_id, target_id, node, round, path, margin,
    lag(path) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS before,
    first_value(round) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS first_round,
    first_value(path) OVER (PARTITION BY run_id, target_id, node ORDER BY round) AS first_path
  FROM winners
)
SELECT run_id, target_id, node, first_round, first_path, round, before, path, margin
FROM paths WHERE before IS NOT NULL AND before <> path AND margin < ${PAIR_MARGIN}`),
  lost_components: sqliteView('lost_components', {
    run_id: integer().notNull(),
    target_id: text().notNull(),
    round: integer().notNull(),
    node: text().notNull(),
    component: text(),
    specifier: text(),
  }).as(sql`SELECT run_id, target_id, round, node, component, specifier
FROM design_rows WHERE magnitude = 'component'`),
  page_height_rows: sqliteView('page_height_rows', {
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
WHERE r.kind = 'page'`),
  broken_rounds: sqliteView('broken_rounds', {
    run_id: integer().notNull(),
    target_id: text().notNull(),
    width: real().notNull(),
    round: integer().notNull(),
    broken_by: text(),
    broken: text().notNull(),
    fixed_after: integer().notNull(),
  }).as(sql`SELECT b.run_id, b.target_id, t.width, b.round, b.broken_by, b.broken,
  EXISTS (SELECT 1 FROM design_rounds x WHERE x.run_id = b.run_id AND x.target_id = b.target_id AND x.round > b.round
    AND x.broken IS NULL) AS fixed_after
FROM design_rounds b
JOIN design_targets t ON t.run_id = b.run_id AND t.target_id = b.target_id
WHERE b.broken IS NOT NULL`),
  lowest_rendered: sqliteView('lowest_rendered', {
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
WHERE l.low = 1`),
}
