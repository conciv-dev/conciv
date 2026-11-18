import {observable, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import type {Transaction} from '@tanstack/solid-db'
import {Component, createElement, useSyncExternalStore, type PropsWithChildren, type ReactNode} from 'react'
import {createRoot} from 'react-dom/client'
import {Excalidraw, THEME, convertToExcalidrawElements, exportToBlob} from '@excalidraw/excalidraw'
import type {AppState, ExcalidrawImperativeAPI, ExcalidrawProps} from '@excalidraw/excalidraw/types'
import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {Deferred, Effect, Exit, Ref, Scope} from 'effect'
import {isPlainObject} from 'es-toolkit'
import {z} from 'zod'
import {useWhiteboardDb} from './db.js'
import {json, type ElementRow, type JsonValue, type PendingRow} from './rows.js'
import {validateSvg} from './svg-caps.js'
import type {Viewport} from './coords.js'
import {asScene, makePendingDrain, makeSceneVersions, RemoveFailed, type SceneElement} from './island-model.js'
import {replayDraft, type ReplayStep} from './replay.js'

type ExportScope = 'live' | 'draft' | 'both'

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const PENDING_REMOVE_RETRY_MS = 100

const skeleton = z.custom<ExcalidrawElementSkeleton>(isPlainObject)
const SkeletonsPayload = z.object({elements: z.array(skeleton)})
const MermaidPayload = z.object({source: z.string()})
const SvgPayload = z.object({svg: z.string(), x: z.number(), y: z.number(), width: z.number(), roughness: z.number()})
const ExportPayload = z.object({requestId: z.string(), scope: z.enum(['live', 'draft', 'both'])})

const asJson = (element: ExcalidrawElement): JsonValue => json.parse(JSON.parse(JSON.stringify(element)))

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

const CANVAS = 'fixed inset-0 pointer-events-auto'

const reportMountError = (error: unknown): void =>
  void Effect.runFork(
    Effect.logError('the excalidraw canvas failed to mount', error).pipe(
      Effect.annotateLogs({plugin: 'whiteboard', surface: 'canvas'}),
    ),
  )

class IslandBoundary extends Component<PropsWithChildren<{onError: (error: unknown) => void}>, {failed: boolean}> {
  override state = {failed: false}
  static getDerivedStateFromError(): {failed: boolean} {
    return {failed: true}
  }
  override componentDidCatch(error: unknown): void {
    this.props.onError(error)
  }
  override render(): ReactNode {
    if (this.state.failed) return createElement('div', {'data-whiteboard-error': ''}, 'canvas failed')
    return this.props.children
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

type Theme = 'light' | 'dark'

const keptSidebar = (state: AppState): AppState['openSidebar'] =>
  state.defaultSidebarDockedPreference ? state.openSidebar : null

export function Island(props: {
  mount: HTMLElement
  room: string
  theme: Theme
  visible: boolean
  onViewport: (viewport: Viewport) => void
}): JSX.Element {
  const db = useWhiteboardDb()
  let container: HTMLDivElement | undefined
  const islandScope = Effect.runSync(Scope.make())
  const scene = Effect.runSync(makeSceneVersions())
  const attached = Ref.makeUnsafe<ExcalidrawImperativeAPI | undefined>(undefined)

  const applyRemote = (rows: readonly ElementRow[]): void => {
    const instance = Ref.getUnsafe(attached)
    if (!instance) return
    if (!Effect.runSync(scene.acceptRemote(rows, instance.getSceneElementsIncludingDeleted()))) return
    instance.updateScene({elements: rows.map((row) => asScene(row.data)), captureUpdate: CAPTURE_NEVER})
  }

  const writeLocal = (next: readonly SceneElement[]): void => {
    Effect.runSync(scene.takeLocal(next)).forEach((element) => {
      db.canvasElements.utils.write({
        room: db.room,
        elementId: element.id,
        data: asJson(element),
        version: element.version,
      })
    })
  }

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
      Effect.map((skeletons) =>
        convertToExcalidrawElements(skeletons, {regenerateIds: false}).map((element: ExcalidrawElement) => ({
          room: db.room,
          elementId: element.id,
          data: asJson(element),
          version: element.version,
        })),
      ),
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

  const commitStep = (draft: ElementRow): ReplayStep<Transaction<ElementRow>> => ({
    elementId: draft.elementId,
    write: () =>
      db.canvasElements.utils.write({
        room: db.room,
        elementId: draft.elementId,
        data: draft.data,
        version: draft.version,
      }),
  })

  const skipOnPointer = (skipped: Deferred.Deferred<void>) => {
    const skip = (): void => void Effect.runSync(Deferred.succeed(skipped, undefined))
    return Effect.acquireRelease(
      Effect.sync(() => container?.addEventListener('pointerdown', skip, {once: true})),
      () => Effect.sync(() => container?.removeEventListener('pointerdown', skip)),
    )
  }

  const commitPending = (row: PendingRow) =>
    Effect.gen(function* () {
      const drafts = yield* Effect.tryPromise(() => db.listElements('draft'))
      const skipped = yield* Deferred.make<void>()
      yield* skipOnPointer(skipped)
      const written = yield* replayDraft(drafts.map(commitStep), skipped)
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

  const liveExportElements = (scope: ExportScope): readonly SceneElement[] =>
    scope === 'draft' ? [] : (Ref.getUnsafe(attached)?.getSceneElements() ?? [])

  const draftExportElements = async (scope: ExportScope): Promise<SceneElement[]> => {
    if (scope === 'live') return []
    await db.canvasDraftElements.preload()
    return [...db.canvasDraftElements.state.values()].map((draft) => asScene(draft.data))
  }

  const exportReply = async (scope: ExportScope): Promise<JsonValue> => {
    const api = Ref.getUnsafe(attached)
    if (scope !== 'draft' && !api) {
      throw new Error(`[whiteboard] the canvas has not attached yet, so a ${scope} export has nothing to render`)
    }
    const elements = [...liveExportElements(scope), ...(await draftExportElements(scope))]
    const blob = await exportToBlob({
      elements,
      files: api?.getFiles() ?? {},
      appState: {exportBackground: true},
    })
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

  const snapshotElements = (): ElementRow[] => [...db.canvasElements.state.values()]
  const initialScene = () => {
    const rows = snapshotElements()
    Effect.runSync(scene.seed(rows))
    return {elements: rows.map((row) => asScene(row.data))}
  }
  const sceneSubscription = db.canvasElements.subscribeChanges(() => applyRemote(snapshotElements()), {
    includeInitialState: true,
  })
  const pendingHandlers: Partial<Record<PendingRow['kind'], (row: PendingRow) => Effect.Effect<void, unknown>>> = {
    skeletons: drawPending,
    mermaid: drawPending,
    svg: drawPending,
    commit: commitPending,
    export: exportPending,
  }
  const drain = Effect.runSync(
    makePendingDrain(
      {
        claim: (row) => Effect.tryPromise(() => db.claimPending(row.id)).pipe(Effect.map(({claimed}) => claimed)),
        perform: (row) => pendingHandlers[row.kind]?.(row) ?? Effect.void,
        remove: (row) =>
          Effect.tryPromise({
            try: () =>
              db.canvasPending.has(row.id)
                ? db.canvasPending.delete(row.id).isPersisted.promise.then(() => undefined)
                : Promise.resolve(),
            catch: (cause) => RemoveFailed.make({message: String(cause)}),
          }),
      },
      {removeRetryMs: PENDING_REMOVE_RETRY_MS},
    ).pipe(Scope.provide(islandScope)),
  )
  const pendingSubscription = db.canvasPending.subscribeChanges(
    () =>
      Effect.runFork(
        drain.see([...db.canvasPending.state.values()].filter((row) => pendingHandlers[row.kind] !== undefined)),
      ),
    {includeInitialState: true},
  )

  onCleanup(() => {
    sceneSubscription.unsubscribe()
    pendingSubscription.unsubscribe()
    Effect.runFork(Scope.close(islandScope, Exit.void))
  })

  const themes = observable(() => props.theme)
  const subscribeTheme = (onChange: () => void): (() => void) => {
    const subscription = themes.subscribe(() => onChange())
    return () => subscription.unsubscribe()
  }
  const readTheme = (): Theme => untrack(() => props.theme)
  const ThemedExcalidraw = (canvasProps: ExcalidrawProps): ReactNode => {
    const theme = useSyncExternalStore(subscribeTheme, readTheme)
    return createElement(Excalidraw, {...canvasProps, theme: theme === 'dark' ? THEME.DARK : THEME.LIGHT})
  }

  const closeLayersOnCanvasPointer = (): void => {
    const api = Ref.getUnsafe(attached)
    const state = api?.getAppState()
    if (!api || !state) return
    const openSidebar = keptSidebar(state)
    if (state.openMenu === null && openSidebar === state.openSidebar) return
    api.updateScene({appState: {openMenu: null, openSidebar}, captureUpdate: CAPTURE_NEVER})
  }

  const renderExcalidraw = (): void => {
    if (!container || !container.isConnected) {
      return reportMountError(new Error('the canvas container never attached to the document'))
    }
    const root = createRoot(container)
    Effect.runSync(
      Scope.addFinalizer(
        islandScope,
        Effect.sync(() => root.unmount()),
      ),
    )
    root.render(
      createElement(
        IslandBoundary,
        {onError: reportMountError},
        createElement(ThemedExcalidraw, {
          initialData: initialScene,
          zenModeEnabled: true,
          viewModeEnabled: false,
          isCollaborating: true,
          excalidrawAPI: (instance: ExcalidrawImperativeAPI) => {
            Effect.runSync(Ref.set(attached, instance))
            const pushViewport = (): void => {
              const state = instance.getAppState()
              props.onViewport({
                scrollX: state.scrollX,
                scrollY: state.scrollY,
                zoom: state.zoom,
                offsetLeft: state.offsetLeft,
                offsetTop: state.offsetTop,
              })
            }
            pushViewport()
            const unsubscribeScroll = instance.onScrollChange(pushViewport)
            Effect.runSync(Scope.addFinalizer(islandScope, Effect.sync(unsubscribeScroll)))
          },
          onChange: (elements: readonly OrderedExcalidrawElement[]) => writeLocal(elements),
          onPointerDown: closeLayersOnCanvasPointer,
        }),
      ),
    )
  }

  onMount(renderExcalidraw)

  return (
    <Portal mount={props.mount}>
      <div
        ref={(element) => (container = element)}
        inert={!props.visible}
        class={props.visible ? CANVAS : `${CANVAS} invisible content-visibility-hidden`}
      />
    </Portal>
  )
}
