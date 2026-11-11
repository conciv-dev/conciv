import {sql, type SQL} from 'drizzle-orm'
import {integer, real, sqliteView, text} from 'drizzle-orm/sqlite-core'

export const waveSummaryView = sqliteView('wave_summary', {
  wave: text(),
  arm: text(),
  width: real().notNull(),
  runs: integer().notNull(),
  done: integer().notNull(),
  median_rows: real(),
  median_pixels: real(),
  median_cost: real(),
  median_lowest_rendered: real(),
}).as(sql`WITH base AS (
  SELECT r.wave, s.arm, s.width, s.run_id, s.run_verdict, s.rows, s.pixels, s.cost, l.lowest
  FROM run_summary s
  JOIN design_runs r ON r.run_id = s.run_id
  LEFT JOIN lowest_rendered l ON l.run_id = s.run_id AND l.target_id = s.target_id
  WHERE s.round IS NOT NULL
)
SELECT g.wave, g.arm, g.width, count(DISTINCT g.run_id) AS runs,
  count(DISTINCT CASE WHEN g.run_verdict = 'done' THEN g.run_id END) AS done,
  ${median('rows')} AS median_rows, ${median('pixels')} AS median_pixels, ${median('cost')} AS median_cost,
  ${median('lowest')} AS median_lowest_rendered
FROM base g GROUP BY g.wave, g.arm, g.width`)

function median(column: string): SQL {
  const value = sql.identifier(column)
  return sql`(SELECT avg(v) FROM (SELECT x.${value} AS v, row_number() OVER (ORDER BY x.${value}) AS i, count(*) OVER () AS n
  FROM base x WHERE x.wave IS g.wave AND x.arm IS g.arm AND x.width = g.width AND x.${value} IS NOT NULL) WHERE i IN ((n + 1) / 2, (n + 2) / 2))`
}
