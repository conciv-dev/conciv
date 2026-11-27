import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import {Cause, Deferred, Effect, Ref, Scope} from 'effect'
import {isPlainObject, keyBy, pickBy} from 'es-toolkit'
import {z} from 'zod'
import {EvlogError} from 'evlog'
import {canvasErrors} from './errors/canvas-errors.js'
import {svgErrors} from './errors/svg-errors.js'
import type {WhiteboardDb} from './whiteboard-db.js'
import {json, type ElementRow, type JsonValue, type PendingRow} from './rows.js'
import {validateSvg} from './svg-caps.js'
import {WhiteboardDrain} from './drain.js'

type ReplayStep<Result> = {elementId: string; write: () => Result}

export function replayDraft<Result>(
  steps: readonly ReplayStep<Result>[],
  skipped: Deferred.Deferred<void>,
): Effect.Effect<Result[]> {
  const perStep = Math.max(60, Math.min(3000 / Math.max(steps.length, 1), 400))
  const pause = Effect.race(Effect.sleep(perStep), Deferred.await(skipped))
  return Effect.forEach(steps, (step, index) =>
    (index === 0 ? Effect.void : pause).pipe(Effect.andThen(Effect.sync(step.write))),
  ).pipe(Effect.withSpan('whiteboard.replay'))
}

export type SceneElement = OrderedExcalidrawElement
type Versioned = Pick<SceneElement, 'id' | 'version' | 'versionNonce'>
type Versions = Readonly<Partial<Record<string, number>>>

const sceneElement = z.custom<SceneElement>(isPlainObject)
const asScene = (data: JsonValue): SceneElement => sceneElement.parse(data)

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

const asJson = (element: ExcalidrawElement): JsonValue => json.parse(JSON.parse(JSON.stringify(element)))
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

const buildSkeletons = (row: PendingRow): Effect.Effect<ExcalidrawElementSkeleton[], unknown> =>
  Effect.gen(function* () {
    if (row.kind === 'mermaid') {
      const {parseMermaidToExcalidraw} = yield* Effect.tryPromise(() => import('@excalidraw/mermaid-to-excalidraw'))
      const {source} = yield* Effect.try(() => MermaidPayload.parse(row.payload))
      const parsed = yield* Effect.tryPromise(() => parseMermaidToExcalidraw(source, {maxEdges: 500}))
      return withStableIds(parsed.elements, row.id)
    }
    if (row.kind === 'svg') {
      const {svgToSkeletons} = yield* Effect.tryPromise(() => import('./svg-convert.js'))
      const {svg, x, y, width, roughness} = yield* Effect.try(() => SvgPayload.parse(row.payload))
      yield* Effect.try(() => validateSvg(svg))
      const skeletons = svgToSkeletons(svg, {x, y, width, roughness})
      if (!skeletons.length) return yield* Effect.fail(svgErrors.NOTHING_DRAWABLE())
      return withStableIds(skeletons, row.id)
    }
    return withStableIds((yield* Effect.try(() => SkeletonsPayload.parse(row.payload))).elements, row.id)
  })

function readFailureReason(failure: unknown): string {
  const cause = Cause.isUnknownError(failure) ? failure.cause : failure
  if (EvlogError.isEvlogError(cause) && cause.fix) return `${cause.message}: ${cause.fix}`
  return cause instanceof Error ? cause.message : String(cause)
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
    buildSkeletons(row).pipe(
      Effect.map((skeletons) => elementsToRows(db.room, canvas.toElements(skeletons))),
      Effect.flatMap((rows) =>
        Effect.tryPromise(() => db.bulkUpsertElements(row.stage === 'draft' ? 'draft' : 'live', rows)),
      ),
      Effect.catch((failure) =>
        Effect.logError(`draining pending ${row.kind} ${row.id} failed`, failure).pipe(
          Effect.andThen(replyDrawFailure(row, readFailureReason(failure))),
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

  const draftExportElements = (scope: ExportScope): Effect.Effect<SceneElement[], unknown> =>
    scope === 'live'
      ? Effect.succeed([])
      : Effect.tryPromise(() => db.canvasDraftElements.preload()).pipe(
          Effect.map(() => rowsToScene([...db.canvasDraftElements.state.values()])),
        )

  const exportReply = (scope: ExportScope): Effect.Effect<JsonValue, unknown> =>
    Effect.gen(function* () {
      const live = canvas.liveElements()
      if (scope !== 'draft' && !live) {
        return yield* Effect.fail(canvasErrors.NOT_ATTACHED({scope}))
      }
      const elements = [...(scope === 'draft' ? [] : (live ?? [])), ...(yield* draftExportElements(scope))]
      const blob = yield* Effect.tryPromise(() => canvas.render(elements))
      const bytes = yield* Effect.tryPromise(() => blob.arrayBuffer())
      return {dataBase64: toBase64(new Uint8Array(bytes))}
    })

  const exportPending = (row: PendingRow) =>
    Effect.gen(function* () {
      const {requestId, scope} = yield* Effect.try(() => ExportPayload.parse(row.payload))
      const payload = yield* exportReply(scope).pipe(
        Effect.catch((failure) =>
          Effect.logError('canvas_export render failed', failure).pipe(
            Effect.as({error: 'export render failed', reason: readFailureReason(failure)}),
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
  const drain = yield* WhiteboardDrain.makePendingDrain(
    {
      claim: (row) => Effect.tryPromise(() => db.claimPending(row.id)).pipe(Effect.map(({claimed}) => claimed)),
      perform: (row) => handlers[row.kind]?.(row) ?? Effect.void,
      remove: (row) =>
        Effect.tryPromise({
          try: async () => {
            if (db.canvasPending.has(row.id)) await db.canvasPending.delete(row.id).isPersisted.promise
          },
          catch: (cause) => canvasErrors.REMOVE_FAILED({id: row.id, cause: cause instanceof Error ? cause : undefined}),
        }),
    },
    options,
  )
  return {
    see: (rows: readonly PendingRow[]) => drain.see(rows.filter((row) => handlers[row.kind] !== undefined)),
  }
})
