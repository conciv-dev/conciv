import {z} from 'zod'
import {json, type JsonValue} from '../shared/rows.js'
import type {Store} from './db/store.js'
import {enrichAnchor} from '../tool/comment/anchor-enrich.js'

const SourceAnchor = z.object({source: z.object({file: z.string()})})

const enrichRow = async (
  save: Store['updateComment'],
  cwd: string,
  signal: AbortSignal,
  id: string,
  room: string,
  anchor: JsonValue,
): Promise<void> => {
  const enriched = await enrichAnchor(cwd, anchor)
  signal.throwIfAborted()
  if (!enriched.hash) return
  await save(id, room, {
    anchor: json.nullable().parse(enriched.anchor ?? null),
    anchorFile: enriched.file ?? null,
    anchorComponent: enriched.component ?? null,
    anchorHash: enriched.hash,
    updatedAt: Date.now(),
  })
}

export const startCommentEnrichment = (store: Store, cwd: string): (() => Promise<unknown>) => {
  const attempted = new Set<string>()
  const inFlight = new Set<Promise<unknown>>()
  const stopping = new AbortController()
  const save: Store['updateComment'] = (...args) => {
    const write = store.updateComment(...args)
    inFlight.add(write)
    return write.finally(() => inFlight.delete(write))
  }
  const unsubscribe = store.onEvent((event) => {
    if (event.table !== 'comments') return
    if (event.type === 'delete') return void attempted.delete(event.key)
    const row = event.row
    if (row.kind !== 'source-linked' || attempted.has(row.id) || row.anchorHash) return
    if (!SourceAnchor.safeParse(row.anchor).success) return
    attempted.add(row.id)
    enrichRow(save, cwd, stopping.signal, row.id, event.room, row.anchor).catch((error: unknown) => {
      console.error(`[whiteboard] comment ${row.id} was not enriched: ${String(error)}`)
    })
  })
  return () => {
    unsubscribe()
    stopping.abort(new Error('the whiteboard stopped before the enrichment finished'))
    return Promise.allSettled(inFlight)
  }
}
