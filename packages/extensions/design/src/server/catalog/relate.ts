import {and, eq} from 'drizzle-orm'
import {uniq, uniqBy} from 'es-toolkit'
import type {Catalog, Component} from '../../shared/catalog-defs.js'
import type {openStore} from '../runs/open-store.js'
import type {storeTables} from '../runs/store-tables.js'

export async function relateRound(input: {
  db: DesignDb
  catalog: Catalog
  targetId: string
  runId: number
  session: string
  round: number
  sites: {node: string; source: string}[]
}): Promise<{relation: Map<string, Component>; write: (tx: Transaction) => void}> {
  const {db, catalog, targetId, runId, session, round} = input
  const {node_components: nodeComponents} = db.tables
  const sourced = uniqBy(input.sites, (row) => `${row.node}\n${row.source}`)
  const components = await catalog.componentsOf(uniq(sourced.map((row) => row.source)))
  const related = sourced.flatMap((row) => {
    const component = components.get(row.source)
    return component === undefined ? [] : [{...row, component}]
  })
  const write = (tx: Transaction): void => {
    tx.delete(nodeComponents)
      .where(
        and(eq(nodeComponents.run_id, runId), eq(nodeComponents.target_id, targetId), eq(nodeComponents.round, round)),
      )
      .run()
    related.forEach(({node, source, component}) =>
      tx
        .insert(nodeComponents)
        .values({
          target_id: targetId,
          run_id: runId,
          session,
          round,
          node,
          component_id: component.id,
          component: component.names[0],
          specifier: component.specifier,
          source,
        })
        .run(),
    )
  }
  return {relation: new Map(related.map(({node, component}) => [node, component])), write}
}

type DesignDb = {orm: ReturnType<typeof openStore>['orm']; tables: typeof storeTables}

type Transaction = Parameters<Parameters<DesignDb['orm']['transaction']>[0]>[0]
