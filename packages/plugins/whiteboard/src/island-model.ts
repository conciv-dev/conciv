import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import {Deferred, Effect, FiberMap, Queue, Ref, Schedule, Schema, Scope, SubscriptionRef} from 'effect'
import {isPlainObject, keyBy, pickBy} from 'es-toolkit'
import {z} from 'zod'
import type {WhiteboardDb} from './whiteboard-db.js'
import {json, type ElementRow, type JsonValue, type PendingRow} from './rows.js'
import {validateSvg} from './svg-caps.js'
import {replayDraft} from './replay.js'
import {startDrain, transitionDrain, type DrainEffect, type DrainEvent, type DrainState} from './drain-machine.js'

export const RemoveFailed = Schema.TaggedStruct('RemoveFailed', {message: Schema.String})
type RemoveFailed = typeof RemoveFailed.Type

type PendingWork = {
  readonly claim: (row: PendingRow) => Effect.Effect<boolean, unknown>
  readonly perform: (row: PendingRow) => Effect.Effect<void, unknown>
  readonly remove: (row: PendingRow) => Effect.Effect<void, RemoveFailed>
}

const REMOVE_MAX_WAIT_MS = 10_000

export const makePendingDrain = Effect.fn('whiteboard.pendingDrain')(function* (
  work: PendingWork,
  options: {removeRetryMs: number},
) {
  const start = startDrain()
  const state = yield* SubscriptionRef.make<DrainState>(start.state)
  const inbox = yield* Queue.unbounded<DrainEvent>()
  const rows = yield* FiberMap.make<string>()
  const retry = Schedule.min([Schedule.exponential(options.removeRetryMs), Schedule.spaced(REMOVE_MAX_WAIT_MS)]).pipe(
    Schedule.jittered,
  )
  const offer = (event: DrainEvent) => Queue.offer(inbox, event)

  const run = ({type, attempt, row}: DrainEffect): Effect.Effect<unknown> => {
    const label = `pending ${row.kind} ${row.id}`
    if (type === 'claim')
      return FiberMap.run(
        rows,
        row.id,
        work.claim(row).pipe(
          Effect.catchCause((cause) => Effect.logError(`claiming ${label} failed`, cause).pipe(Effect.as(false))),
          Effect.flatMap((claimed) => offer({type: 'claimed', id: row.id, attempt, claimed})),
        ),
      )
    if (type === 'run')
      return FiberMap.run(
        rows,
        row.id,
        work.perform(row).pipe(
          Effect.catchCause((cause) => Effect.logError(`running ${label} failed`, cause)),
          Effect.andThen(offer({type: 'ran', id: row.id, attempt})),
        ),
      )
    return FiberMap.run(
      rows,
      row.id,
      work.remove(row).pipe(
        Effect.tapError((failure) => Effect.logWarning(`removing ${label} failed; retrying`, failure.message)),
        Effect.retry(retry),
        Effect.andThen(offer({type: 'removed', id: row.id, attempt})),
      ),
    )
  }

  const step = (event: DrainEvent) =>
    SubscriptionRef.modify(state, (current) => {
      const next = transitionDrain(current, event)
      return [next.effects, next.state]
    }).pipe(Effect.flatMap((effects) => Effect.forEach(effects, run, {discard: true})))

  yield* Queue.take(inbox).pipe(Effect.flatMap(step), Effect.forever, Effect.forkScoped)
  yield* Effect.addFinalizer(() => step({type: 'disposed'}))

  return {state, see: (seen: readonly PendingRow[]) => offer({type: 'seen', rows: seen})}
})

export type PendingDrain = Effect.Success<ReturnType<typeof makePendingDrain>>

export type SceneElement = OrderedExcalidrawElement
type Versioned = Pick<SceneElement, 'id' | 'version' | 'versionNonce'>
type Versions = Readonly<Partial<Record<string, number>>>

const sceneElement = z.custom<SceneElement>(isPlainObject)
export const asScene = (data: JsonValue): SceneElement => sceneElement.parse(data)

export const makeSceneVersions = Effect.fn('whiteboard.sceneVersions')(function* () {
  const versions = yield* Ref.make<Versions>({})
  const known = (current: Versions, elementId: string): number => current[elementId] ?? -1

  const seed = (rows: readonly ElementRow[]) =>
    Ref.set(versions, Object.fromEntries(rows.map((row) => [row.elementId, row.version])))

  const acceptRemote = (rows: readonly ElementRow[], shown: readonly Versioned[]) =>
    Ref.modify(versions, (current): [boolean, Versions] => {
      const incoming = keyBy(rows, (row) => row.elementId)
      const showing = keyBy(shown, (element) => element.id)
      const lostTie = (row: ElementRow): boolean => {
        const element = showing[row.elementId]
        return element?.version === row.version && element.versionNonce !== asScene(row.data).versionNonce
      }
      const changed =
        rows.some((row) => known(current, row.elementId) < row.version || lostTie(row)) ||
        Object.keys(current).some((elementId) => incoming[elementId] === undefined)
      return [
        changed,
        {
          ...pickBy(current, (_version, elementId) => incoming[elementId] !== undefined),
          ...Object.fromEntries(
            rows.map((row) => [row.elementId, Math.max(known(current, row.elementId), row.version)]),
          ),
        },
      ]
    })

  const takeLocal = <Element extends Versioned>(elements: readonly Element[]) =>
    Ref.modify(versions, (current): [readonly Element[], Versions] => {
      const changed = elements.filter((element) => known(current, element.id) < element.version)
      return [changed, {...current, ...Object.fromEntries(changed.map((element) => [element.id, element.version]))}]
    })

  return {seed, acceptRemote, takeLocal}
})

export const asJson = (element: ExcalidrawElement): JsonValue => json.parse(JSON.parse(JSON.stringify(element)))
export const rowsToScene = (rows: readonly ElementRow[]): SceneElement[] => rows.map((row) => asScene(row.data))
export const elementsToRows = (room: string, elements: readonly ExcalidrawElement[]): ElementRow[] =>
  elements.map((element) => ({room, elementId: element.id, data: asJson(element), version: element.version}))

type ExportScope = 'live' | 'draft' | 'both'

const skeleton = z.custom<ExcalidrawElementSkeleton>(isPlainObject)
const SkeletonsPayload = z.object({elements: z.array(skeleton)})
const ScenePoint = z.object({x: z.number(), y: z.number()})
const MermaidPayload = z.object({source: z.string()})
const SvgPayload = z.object({svg: z.string(), x: z.number(), y: z.number(), width: z.number(), roughness: z.number()})
const ExportPayload = z.object({requestId: z.string(), scope: z.enum(['live', 'draft', 'both'])})

const withStableIds = (skeletons: ExcalidrawElementSkeleton[], rowId: string): ExcalidrawElementSkeleton[] =>
  skeletons.map((item, index) => (item.id ? item : {...item, id: `${rowId}-${index}`}))

async function buildSkeletons(row: PendingRow): Promise<ExcalidrawElementSkeleton[]> {
  if (row.kind === 'mermaid') {
    const {parseMermaidToExcalidraw} = await import('@excalidraw/mermaid-to-excalidraw')
    const {source} = MermaidPayload.parse(row.payload)
    return withStableIds((await parseMermaidToExcalidraw(source, {maxEdges: 500})).elements, row.id)
  }
  if (row.kind === 'svg') {
    const {svgToSkeletons} = await import('./svg-convert.js')
    const {svg, x, y, width, roughness} = SvgPayload.parse(row.payload)
    validateSvg(svg)
    const skeletons = svgToSkeletons(svg, {x, y, width, roughness})
    if (!skeletons.length) throw new Error('the svg had nothing drawable')
    return withStableIds(skeletons, row.id)
  }
  return withStableIds(SkeletonsPayload.parse(row.payload).elements, row.id)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export type CanvasPort = {
  readonly toElements: (skeletons: ExcalidrawElementSkeleton[]) => readonly ExcalidrawElement[]
  readonly liveElements: () => readonly SceneElement[] | undefined
  readonly render: (elements: readonly SceneElement[]) => Promise<Blob>
  readonly skipOnPointer: (skipped: Deferred.Deferred<void>) => Effect.Effect<void, never, Scope.Scope>
  readonly drawAt: (point: {x: number; y: number}) => void
}

export const makeCanvasPending = Effect.fn('whiteboard.canvasPending')(function* (
  db: WhiteboardDb,
  canvas: CanvasPort,
  options: {removeRetryMs: number},
) {
  const replyDrawFailure = (row: PendingRow, reason: string) =>
    Effect.tryPromise(
      () =>
        db.canvasReplies.insert({
          id: crypto.randomUUID(),
          room: db.room,
          requestId: row.id,
          kind: 'draw',
          payload: {error: reason},
        }).isPersisted.promise,
    ).pipe(
      Effect.catch((replyError) =>
        Effect.logError(`the failure of pending ${row.kind} ${row.id} could not be answered`, replyError),
      ),
    )

  const drawPending = (row: PendingRow) =>
    Effect.tryPromise(() => buildSkeletons(row)).pipe(
      Effect.map((skeletons) => elementsToRows(db.room, canvas.toElements(skeletons))),
      Effect.flatMap((rows) =>
        Effect.tryPromise(() => db.bulkUpsertElements(row.stage === 'draft' ? 'draft' : 'live', rows)),
      ),
      Effect.catch((failure) =>
        Effect.logError(`draining pending ${row.kind} ${row.id} failed`, failure).pipe(
          Effect.andThen(
            replyDrawFailure(row, failure.cause instanceof Error ? failure.cause.message : String(failure.cause)),
          ),
        ),
      ),
    )

  const commitPending = (row: PendingRow) =>
    Effect.gen(function* () {
      const drafts = yield* Effect.tryPromise(() => db.listElements('draft'))
      const skipped = yield* Deferred.make<void>()
      yield* canvas.skipOnPointer(skipped)
      const steps = drafts.map((draft) => ({
        elementId: draft.elementId,
        write: () => {
          const point = ScenePoint.safeParse(draft.data)
          if (point.success) canvas.drawAt(point.data)
          return db.canvasElements.utils.write({
            room: db.room,
            elementId: draft.elementId,
            data: draft.data,
            version: draft.version,
          })
        },
      }))
      const written = yield* replayDraft(steps, skipped)
      yield* Effect.tryPromise(() => Promise.all(written.map((transaction) => transaction.isPersisted.promise)))
      yield* Effect.tryPromise(() =>
        db.bulkDeleteElements(
          'draft',
          drafts.map((draft) => draft.elementId),
        ),
      )
    }).pipe(
      Effect.scoped,
      Effect.tapError((failure) => Effect.logError(`committing pending ${row.id} failed`, failure)),
    )

  const draftExportElements = async (scope: ExportScope): Promise<SceneElement[]> => {
    if (scope === 'live') return []
    await db.canvasDraftElements.preload()
    return rowsToScene([...db.canvasDraftElements.state.values()])
  }

  const exportReply = async (scope: ExportScope): Promise<JsonValue> => {
    const live = canvas.liveElements()
    if (scope !== 'draft' && !live) {
      throw new Error(`[whiteboard] the canvas has not attached yet, so a ${scope} export has nothing to render`)
    }
    const elements = [...(scope === 'draft' ? [] : (live ?? [])), ...(await draftExportElements(scope))]
    const blob = await canvas.render(elements)
    return {dataBase64: toBase64(new Uint8Array(await blob.arrayBuffer()))}
  }

  const exportPending = (row: PendingRow) =>
    Effect.gen(function* () {
      const {requestId, scope} = yield* Effect.try(() => ExportPayload.parse(row.payload))
      const payload = yield* Effect.tryPromise(() => exportReply(scope)).pipe(
        Effect.catch((failure) =>
          Effect.logError('canvas_export render failed', failure).pipe(
            Effect.as({error: 'export render failed', reason: String(failure.cause)}),
          ),
        ),
      )
      yield* Effect.try(() =>
        db.canvasReplies.insert({id: crypto.randomUUID(), room: db.room, requestId, kind: 'export', payload}),
      )
    })

  const handlers: Partial<Record<PendingRow['kind'], (row: PendingRow) => Effect.Effect<void, unknown>>> = {
    skeletons: drawPending,
    mermaid: drawPending,
    svg: drawPending,
    commit: commitPending,
    export: exportPending,
  }
  const drain = yield* makePendingDrain(
    {
      claim: (row) => Effect.tryPromise(() => db.claimPending(row.id)).pipe(Effect.map(({claimed}) => claimed)),
      perform: (row) => handlers[row.kind]?.(row) ?? Effect.void,
      remove: (row) =>
        Effect.tryPromise({
          try: () =>
            db.canvasPending.has(row.id)
              ? db.canvasPending.delete(row.id).isPersisted.promise.then(() => undefined)
              : Promise.resolve(),
          catch: (cause) => RemoveFailed.make({message: String(cause)}),
        }),
    },
    options,
  )
  return {
    see: (rows: readonly PendingRow[]) => drain.see(rows.filter((row) => handlers[row.kind] !== undefined)),
  }
})
