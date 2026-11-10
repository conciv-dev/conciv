import type {Catalog} from '../../shared/catalog-defs.js'
import type {openStore} from '../runs/open-store.js'
import type {storeTables} from '../runs/store-tables.js'
import {relateRound} from './relate.js'

export async function backfillRelation(input: {db: DesignDb; catalog: Catalog}): Promise<number> {
  const {db, catalog} = input
  const {fom, node_components: nodeComponents} = db.tables
  const [related] = await db.orm.select({seq: nodeComponents.seq}).from(nodeComponents).limit(1)
  if (related !== undefined) return 0
  const held = await db.orm
    .select({
      targetId: fom.target_id,
      runId: fom.run_id,
      round: fom.round,
      node: fom.node,
      source: fom.source,
      site: fom.site,
    })
    .from(fom)
  const rounds = Object.values(Object.groupBy(held, (row) => `${row.runId}\n${row.targetId}\n${row.round}`))
  return rounds.reduce(async (written, sites = []) => {
    const [first] = sites
    if (first === undefined) return written
    const {relation, write} = await relateRound({
      db,
      catalog,
      targetId: first.targetId,
      runId: first.runId,
      round: first.round,
      sites: sites.flatMap((row) => {
        const source = row.source ?? row.site
        return source === null ? [] : [{node: row.node, source}]
      }),
    })
    db.orm.transaction(write)
    return (await written) + relation.size
  }, Promise.resolve(0))
}

type DesignDb = {orm: ReturnType<typeof openStore>['orm']; tables: typeof storeTables}
