import {Clock, Effect, FiberMap, Stream} from 'effect'
import {z} from 'zod'
import {json, type CommentRow} from './rows.js'
import type {Store, WhiteboardEvent} from './store.js'
import {enrichAnchor, type LoadResolver} from './anchor-enrich.js'

const SourceAnchor = z.object({source: z.object({file: z.string()})})

type CommentChange = Extract<WhiteboardEvent, {table: 'comments'}>

const isCommentChange = (event: WhiteboardEvent): event is CommentChange => event.table === 'comments'

const reportUnenriched = (id: string) => (error: unknown) =>
  Effect.logError(`[whiteboard] comment ${id} was not enriched`, error)

const enrichRow = (store: Store, resolver: LoadResolver, room: string, row: CommentRow) =>
  Effect.gen(function* () {
    const enriched = yield* enrichAnchor(resolver, row.anchor)
    if (!enriched.hash) return
    const anchorHash = enriched.hash
    const updatedAt = yield* Clock.currentTimeMillis
    yield* store.comments
      .update(room, row.id, {
        anchor: json.nullable().parse(enriched.anchor ?? null),
        anchorFile: enriched.file ?? null,
        anchorComponent: enriched.component ?? null,
        anchorHash,
        updatedAt,
      })
      .pipe(Effect.uninterruptible)
  }).pipe(Effect.catch(reportUnenriched(row.id)), Effect.catchDefect(reportUnenriched(row.id)))

const needsEnrichment = (row: CommentRow): boolean =>
  row.kind === 'source-linked' && !row.anchorHash && SourceAnchor.safeParse(row.anchor).success

export const enrichComments = Effect.fn('whiteboard.enrichComments')(function* (store: Store, resolver: LoadResolver) {
  const enrichments = yield* FiberMap.make<string>()
  const changes = yield* store.follow
  yield* changes.pipe(
    Stream.filter(isCommentChange),
    Stream.runForEach((change) => {
      if (change.type === 'delete') return FiberMap.remove(enrichments, change.key)
      if (!needsEnrichment(change.row)) return Effect.void
      return FiberMap.run(enrichments, change.row.id, enrichRow(store, resolver, change.room, change.row), {
        onlyIfMissing: true,
      })
    }),
    Effect.forkScoped({startImmediately: true}),
  )
})
