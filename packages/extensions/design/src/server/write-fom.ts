import {and, eq} from 'drizzle-orm'
import type {ExtensionDb} from '@conciv/extension'
import type {IdTree} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import type {designTables} from './tables.js'

export function writeFom(written: {
  tx: Transaction
  fom: DesignDb['tables']['fom']
  id: string
  runId: number | null
  round: number
  ids: {tree: IdTree; revoted: Record<string, string>}
  names: Map<string, string>
  before: FomRow[]
  at: number
}): void {
  const {tx, fom, id, runId, round, names, at} = written
  const {tree, revoted} = written.ids
  const carried = new Map(written.before.map((row) => [`${row.id}/${row.node}`, row]))
  tx.delete(fom)
    .where(and(eq(fom.target_id, id), eq(fom.round, round)))
    .run()
  for (const {node: site} of walk(tree.root)) {
    for (const entry of site.fom) {
      const reason = revoted[site.id]
      const previous = carried.get(`${site.id}/${entry.nodeId}`)
      const {at: loc} = site.src
      tx.insert(fom)
        .values({
          target_id: id,
          run_id: runId,
          id: site.id,
          node: entry.nodeId,
          name: names.get(entry.nodeId) ?? null,
          instance: entry.instance,
          source: loc === null ? null : `${loc.file}:${loc.line}:${loc.column}`,
          site: site.src.site ?? null,
          confidence: entry.confidence,
          margin: entry.margin,
          round,
          voted_round: entry.round,
          revoted_round: reason === undefined ? (previous?.revoted_round ?? null) : round,
          reason: reason ?? previous?.reason ?? null,
          at,
        })
        .run()
    }
  }
}

type DesignDb = ExtensionDb<ReturnType<typeof designTables>>

type FomRow = DesignDb['tables']['fom']['$inferSelect']

type Transaction = Parameters<Parameters<DesignDb['orm']['transaction']>[0]>[0]
