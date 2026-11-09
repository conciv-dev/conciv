import type {ExtensionDb} from '@conciv/extension'
import type {Catalog} from '../../shared/catalog-defs.js'
import type {designTables} from '../tables.js'
import {relateRound} from './relate.js'

export async function backfillRelation(input: {db: DesignDb; catalog: Catalog}): Promise<number> {
  const {db, catalog} = input
  const {fom, node_components: nodeComponents} = db.tables
  const [related] = await db.orm.select({seq: nodeComponents.seq}).from(nodeComponents).limit(1)
  if (related !== undefined) return 0
  const rounds = await db.orm.selectDistinct({targetId: fom.target_id, round: fom.round}).from(fom)
  return rounds.reduce(
    async (written, {targetId, round}) => (await written) + (await relateRound({db, catalog, targetId, round})).size,
    Promise.resolve(0),
  )
}

type DesignDb = ExtensionDb<ReturnType<typeof designTables>>
