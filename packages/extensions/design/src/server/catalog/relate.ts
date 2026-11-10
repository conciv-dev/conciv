import {and, eq} from 'drizzle-orm'
import {uniq, uniqBy} from 'es-toolkit'
import type {ExtensionDb} from '@conciv/extension'
import type {Catalog, Component} from '../../shared/catalog-defs.js'
import type {designTables} from '../tables.js'

export async function relateRound(input: {
  db: DesignDb
  catalog: Catalog
  targetId: string
  round: number
  sites: {node: string; source: string}[]
}): Promise<Map<string, Component>> {
  const {db, catalog, targetId, round} = input
  const {node_components: nodeComponents} = db.tables
  const sourced = uniqBy(input.sites, (row) => `${row.node}\n${row.source}`)
  const components = await catalog.componentsOf(uniq(sourced.map((row) => row.source)))
  const related = sourced.flatMap((row) => {
    const component = components.get(row.source)
    return component === undefined ? [] : [{...row, component}]
  })
  db.orm.transaction((tx) => {
    tx.delete(nodeComponents)
      .where(and(eq(nodeComponents.target_id, targetId), eq(nodeComponents.round, round)))
      .run()
    related.forEach(({node, source, component}) =>
      tx.insert(nodeComponents).values({target_id: targetId, round, node, component_id: component.id, source}).run(),
    )
  })
  return new Map(related.map(({node, component}) => [node, component]))
}

type DesignDb = ExtensionDb<ReturnType<typeof designTables>>
