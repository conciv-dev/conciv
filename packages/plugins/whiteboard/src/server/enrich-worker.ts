import {Effect, FiberMap, Queue, Stream} from 'effect'
import {z} from 'zod'
import {json, type CommentRow} from '../shared/rows.js'
import type {Store, WhiteboardChange} from './db/store.js'
import {enrichAnchor} from '../tool/comment/anchor-enrich.js'

const SourceAnchor = z.object({source: z.object({file: z.string()})})

type CommentChange = Extract<WhiteboardChange, {table: 'comments'}>

const reportUnenriched = (id: string) => (error: unknown) =>
  Effect.sync(() => {
    console.error(`[whiteboard] comment ${id} was not enriched: ${String(error)}`)
  })

const enrichRow = (store: Store, cwd: string, room: string, row: CommentRow) =>
  Effect.gen(function* () {
    const enriched = yield* Effect.tryPromise({try: () => enrichAnchor(cwd, row.anchor), catch: (error) => error})
    if (!enriched.hash) return
    const anchorHash = enriched.hash
    yield* Effect.tryPromise({
      try: () =>
        store.updateComment(row.id, room, {
          anchor: json.nullable().parse(enriched.anchor ?? null),
          anchorFile: enriched.file ?? null,
          anchorComponent: enriched.component ?? null,
          anchorHash,
          updatedAt: Date.now(),
        }),
      catch: (error) => error,
    }).pipe(Effect.uninterruptible)
  }).pipe(Effect.catch(reportUnenriched(row.id)), Effect.catchDefect(reportUnenriched(row.id)))

const needsEnrichment = (row: CommentRow): boolean =>
  row.kind === 'source-linked' && !row.anchorHash && SourceAnchor.safeParse(row.anchor).success

export const enrichComments = (store: Store, cwd: string) =>
  Effect.gen(function* () {
    const enrichments = yield* FiberMap.make<string>()
    const changes = yield* Queue.unbounded<CommentChange>()
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        store.onEvent((event) => {
          if (event.table !== 'comments') return
          Queue.offerUnsafe(changes, event)
        }),
      ),
      (stopListening) => Effect.sync(stopListening),
    )
    yield* Stream.fromQueue(changes).pipe(
      Stream.runForEach((change) => {
        if (change.type === 'delete') return FiberMap.remove(enrichments, change.key)
        if (!needsEnrichment(change.row)) return Effect.void
        return FiberMap.run(enrichments, change.row.id, enrichRow(store, cwd, change.room, change.row), {
          onlyIfMissing: true,
        })
      }),
      Effect.forkScoped({startImmediately: true}),
    )
  })
