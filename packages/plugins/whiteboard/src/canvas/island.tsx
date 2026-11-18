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
import {Effect, Exit, Ref, Scope} from 'effect'
import {isPlainObject, keyBy, pickBy} from 'es-toolkit'
import {z} from 'zod'
import {useWhiteboardDb} from '../client/db.js'
import {json, type ElementRow, type JsonValue, type PendingRow} from '../shared/rows.js'
import {validateSvg} from '../shared/svg-caps.js'
import type {Viewport} from './coords.js'
import {makePendingDrain, RemoveFailed} from './island-model.js'
import {replayDraft, type ReplayHandle, type ReplayStep} from './replay.js'

type SceneElement = OrderedExcalidrawElement
type ExportScope = 'live' | 'draft' | 'both'

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const PENDING_REMOVE_RETRY_MS = 100

const sceneElement = z.custom<SceneElement>(isPlainObject)
const skeleton = z.custom<ExcalidrawElementSkeleton>(isPlainObject)
const SkeletonsPayload = z.object({elements: z.array(skeleton)})
const MermaidPayload = z.object({source: z.string()})
const SvgPayload = z.object({svg: z.string(), x: z.number(), y: z.number(), width: z.number(), roughness: z.number()})
const ExportPayload = z.object({requestId: z.string(), scope: z.enum(['live', 'draft', 'both'])})

const asScene = (data: JsonValue): SceneElement => sceneElement.parse(data)
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
  console.error(`[whiteboard] the excalidraw canvas failed to mount: ${String(error)}`)

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
  const guard = {applyingRemote: false}
  const versions = Ref.makeUnsafe<Readonly<Partial<Record<string, number>>>>({})
  const attached = Ref.makeUnsafe<ExcalidrawImperativeAPI | undefined>(undefined)
  const readVersion = (elementId: string): number => Ref.getUnsafe(versions)[elementId] ?? -1
  const setVersions = (next: Readonly<Partial<Record<string, number>>>): void => Effect.runSync(Ref.set(versions, next))

  const applyRemote = (rows: readonly ElementRow[]): void => {
    const instance = Ref.getUnsafe(attached)
    if (!instance) return
    const incoming = keyBy(rows, (row) => row.elementId)
    const shown = keyBy(instance.getSceneElementsIncludingDeleted(), (element) => element.id)
    const lostTie = (row: ElementRow): boolean => {
      const element = shown[row.elementId]
      return element?.version === row.version && element.versionNonce !== asScene(row.data).versionNonce
    }
    const known = Ref.getUnsafe(versions)
    const remoteChanged =
      rows.some((row) => readVersion(row.elementId) < row.version || lostTie(row)) ||
      Object.keys(known).some((elementId) => incoming[elementId] === undefined)
    setVersions({
      ...pickBy(known, (_version, elementId) => incoming[elementId] !== undefined),
      ...Object.fromEntries(rows.map((row) => [row.elementId, Math.max(readVersion(row.elementId), row.version)])),
    })
    if (!remoteChanged) return
    guard.applyingRemote = true
    try {
      instance.updateScene({elements: rows.map((row) => asScene(row.data)), captureUpdate: CAPTURE_NEVER})
    } finally {
      guard.applyingRemote = false
    }
  }

  const writeLocal = (next: readonly SceneElement[]): void => {
    if (guard.applyingRemote) return
    const changed = next.filter((element) => readVersion(element.id) < element.version)
    if (!changed.length) return
    setVersions({
      ...Ref.getUnsafe(versions),
      ...Object.fromEntries(changed.map((element) => [element.id, element.version])),
    })
    changed.forEach((element) => {
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

  const performCommit = async (row: PendingRow): Promise<void> => {
    let handle: ReplayHandle<Transaction<ElementRow>> | undefined
    const onPointerDown = (): void => handle?.skip()
    try {
      const drafts = await db.listElements('draft')
      container?.addEventListener('pointerdown', onPointerDown, {once: true})
      handle = replayDraft(drafts.map(commitStep))
      const written = await handle.done
      await Promise.all(written.map((transaction) => transaction.isPersisted.promise))
      await db.bulkDeleteElements(
        'draft',
        drafts.map((draft) => draft.elementId),
      )
    } catch (error) {
      console.error(`[whiteboard] performCommit ${row.id} failed: ${String(error)}`)
    } finally {
      container?.removeEventListener('pointerdown', onPointerDown)
    }
  }

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
  const sceneSubscription = db.canvasElements.subscribeChanges(() => applyRemote(snapshotElements()), {
    includeInitialState: true,
  })
  const pendingHandlers: Partial<Record<PendingRow['kind'], (row: PendingRow) => Effect.Effect<void, unknown>>> = {
    skeletons: drawPending,
    mermaid: drawPending,
    svg: drawPending,
    commit: (row) => Effect.tryPromise(() => performCommit(row)),
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
          initialData: {elements: []},
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
            applyRemote(snapshotElements())
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
