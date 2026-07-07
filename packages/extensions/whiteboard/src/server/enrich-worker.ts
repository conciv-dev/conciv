import {z} from 'zod'
import {json, type JsonValue} from '../shared/rows.js'
import type {Store} from './db/store.js'
import {enrichAnchor} from '../tool/comment/anchor-enrich.js'

const SourceAnchor = z.object({source: z.object({file: z.string()})})

const enrichRow = async (store: Store, cwd: string, id: string, anchor: JsonValue): Promise<void> => {
  const enriched = await enrichAnchor(cwd, anchor)
  if (!enriched.hash) return
  await store.updateComment(id, {
    anchor: json.nullable().parse(enriched.anchor ?? null),
    anchorFile: enriched.file ?? null,
    anchorComponent: enriched.component ?? null,
    anchorHash: enriched.hash,
    updatedAt: Date.now(),
  })
}

export const startCommentEnrichment = (store: Store, cwd: string): (() => void) => {
  const attempted = new Set<string>()
  return store.onEvent((event) => {
    if (event.table !== 'comments') return
    if (event.type === 'delete') return void attempted.delete(event.key)
    const row = event.row
    if (row.kind !== 'source-linked' || attempted.has(row.id) || row.anchorHash) return
    if (!SourceAnchor.safeParse(row.anchor).success) return
    attempted.add(row.id)
    void enrichRow(store, cwd, row.id, row.anchor)
  })
}
