import {observable, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {AsyncRetryer, Batcher} from '@tanstack/pacer'
import type {Transaction} from '@tanstack/solid-db'
import {createElement, useSyncExternalStore, type ReactNode} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {createRoot, type Root} from 'react-dom/client'
import {Excalidraw, THEME, convertToExcalidrawElements, exportToBlob} from '@excalidraw/excalidraw'
import type {AppState, ExcalidrawImperativeAPI, ExcalidrawProps} from '@excalidraw/excalidraw/types'
import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {isPlainObject} from 'es-toolkit'
import {z} from 'zod'
import {useWhiteboardDb} from '../client/db.js'
import {json, type ElementRow, type JsonValue, type PendingRow} from '../shared/rows.js'
import {validateSvg} from '../shared/svg-caps.js'
import type {Viewport} from './coords.js'
import {replayDraft, type ReplayHandle, type ReplayStep} from './replay.js'

type SceneElement = OrderedExcalidrawElement
type ExportScope = 'live' | 'draft' | 'both'

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const PENDING_DRAIN_TASK_MS = 0
const PENDING_REMOVE_RETRY_MS = 100
const PENDING_REMOVE_MAX_WAIT_MS = 10_000

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

const mountFailedFallback = createElement('div', {'data-whiteboard-error': ''}, 'canvas failed')

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
  let root: Root | undefined
  let unsubscribeScroll: (() => void) | undefined
  const guard = {applyingRemote: false}
  const versions = new Map<string, number>()
  let bufferedScene: readonly ElementRow[] | undefined

  let api: ExcalidrawImperativeAPI | undefined

  const applyRemote = (rows: readonly ElementRow[]): void => {
    const instance = api
    if (!instance) {
      bufferedScene = rows
      return
    }
    const incoming = new Set(rows.map((row) => row.elementId))
    const shown = new Map(instance.getSceneElementsIncludingDeleted().map((element) => [element.id, element]))
    const lostTie = (row: ElementRow): boolean => {
      const element = shown.get(row.elementId)
      return element?.version === row.version && element.versionNonce !== asScene(row.data).versionNonce
    }
    const remoteChanged =
      rows.some((row) => (versions.get(row.elementId) ?? -1) < row.version || lostTie(row)) ||
      [...versions.keys()].some((elementId) => !incoming.has(elementId))
    versions.forEach((_version, elementId) => {
      if (!incoming.has(elementId)) versions.delete(elementId)
    })
    rows.forEach((row) => {
      versions.set(row.elementId, Math.max(versions.get(row.elementId) ?? -1, row.version))
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
    const changed = next.filter((element) => (versions.get(element.id) ?? -1) < element.version)
    if (!changed.length) return
    changed.forEach((element) => {
      versions.set(element.id, element.version)
      db.canvasElements.utils.write({
        room: props.room,
        elementId: element.id,
        data: asJson(element),
        version: element.version,
      })
    })
  }

  const draining = new Set<string>()
  const lifetime = new AbortController()
  const removePending = (row: PendingRow): Promise<void | undefined> =>
    new AsyncRetryer(
      async () => {
        if (db.canvasPending.has(row.id)) await db.canvasPending.delete(row.id).isPersisted.promise
      },
      {
        maxAttempts: () => (lifetime.signal.aborted ? 0 : Number.POSITIVE_INFINITY),
        backoff: 'exponential',
        baseWait: PENDING_REMOVE_RETRY_MS,
        maxWait: PENDING_REMOVE_MAX_WAIT_MS,
        throwOnError: false,
        onError: (error) => {
          if (!lifetime.signal.aborted) {
            console.error(`[whiteboard] removing pending ${row.kind} ${row.id} failed; retrying`, error)
          }
        },
      },
    ).execute()
  const replyDrawFailure = async (row: PendingRow, error: unknown): Promise<void> => {
    const reason = error instanceof Error ? error.message : String(error)
    await db.canvasReplies
      .insert({id: crypto.randomUUID(), room: props.room, requestId: row.id, kind: 'draw', payload: {error: reason}})
      .isPersisted.promise.catch((replyError: unknown) =>
        console.error(
          `[whiteboard] the failure of pending ${row.kind} ${row.id} could not be answered: ${String(replyError)}`,
        ),
      )
  }
  const drainPending = async (row: PendingRow): Promise<void> => {
    try {
      const drawn = convertToExcalidrawElements(await buildSkeletons(row), {regenerateIds: false})
      const rows = drawn.map((element: ExcalidrawElement) => ({
        room: props.room,
        elementId: element.id,
        data: asJson(element),
        version: element.version,
      }))
      const scope = row.stage === 'draft' ? 'draft' : 'live'
      await db.bulkUpsertElements(scope, rows)
    } catch (error) {
      console.error(`[whiteboard] draining pending ${row.kind} ${row.id} failed: ${String(error)}`)
      await replyDrawFailure(row, error)
    } finally {
      void removePending(row)
    }
  }

  const commitStep = (draft: ElementRow): ReplayStep<Transaction<ElementRow>> => ({
    elementId: draft.elementId,
    write: () =>
      db.canvasElements.utils.write({
        room: props.room,
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
      void removePending(row)
    }
  }

  const liveExportElements = (scope: ExportScope): readonly SceneElement[] =>
    scope === 'draft' ? [] : (api?.getSceneElements() ?? [])

  const draftExportElements = async (scope: ExportScope): Promise<SceneElement[]> => {
    if (scope === 'live') return []
    await db.canvasDraftElements.preload()
    return [...db.canvasDraftElements.state.values()].map((draft) => asScene(draft.data))
  }

  const exportReply = async (scope: ExportScope): Promise<JsonValue> => {
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

  const performExport = async (row: PendingRow): Promise<void> => {
    const {requestId, scope} = ExportPayload.parse(row.payload)
    const payload = await exportReply(scope).catch((error: unknown) => {
      console.error(`[whiteboard] canvas_export render failed: ${String(error)}`)
      return {error: 'export render failed', reason: String(error)}
    })
    try {
      db.canvasReplies.insert({id: crypto.randomUUID(), room: props.room, requestId, kind: 'export', payload})
    } finally {
      void removePending(row)
    }
  }

  const snapshotElements = (): ElementRow[] => [...db.canvasElements.state.values()]
  const sceneSubscription = db.canvasElements.subscribeChanges(() => applyRemote(snapshotElements()), {
    includeInitialState: true,
  })
  const pendingHandlers: Partial<Record<PendingRow['kind'], (row: PendingRow) => Promise<void>>> = {
    skeletons: drainPending,
    mermaid: drainPending,
    svg: drainPending,
    commit: performCommit,
    export: performExport,
  }
  const claimPending = (row: PendingRow): Promise<boolean> =>
    db.claimPending(row.id).then(
      ({claimed}) => claimed,
      (error: unknown) => {
        console.error(`[whiteboard] claiming pending ${row.kind} ${row.id} failed: ${String(error)}`)
        return false
      },
    )
  const claimAndRun = async (row: PendingRow, handler: (row: PendingRow) => Promise<void>): Promise<void> => {
    if (!(await claimPending(row))) return void draining.delete(row.id)
    await handler(row)
  }
  const runPending = (row: PendingRow): void => {
    const handler = pendingHandlers[row.kind]
    if (handler) void claimAndRun(row, handler)
  }
  const drainTask = new Batcher<PendingRow>((rows) => rows.forEach(runPending), {wait: PENDING_DRAIN_TASK_MS})
  const queueDrain = (row: PendingRow): void => {
    if (draining.has(row.id) || !pendingHandlers[row.kind]) return
    draining.add(row.id)
    drainTask.addItem(row)
  }
  const pendingSubscription = db.canvasPending.subscribeChanges(
    () => [...db.canvasPending.state.values()].forEach(queueDrain),
    {includeInitialState: true},
  )

  onCleanup(() => {
    sceneSubscription.unsubscribe()
    pendingSubscription.unsubscribe()
    drainTask.clear()
    lifetime.abort()
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
    const state = api?.getAppState()
    if (!state) return
    const openSidebar = keptSidebar(state)
    if (state.openMenu === null && openSidebar === state.openSidebar) return
    api?.updateScene({appState: {openMenu: null, openSidebar}, captureUpdate: CAPTURE_NEVER})
  }

  const renderExcalidraw = (): void => {
    if (!container || !container.isConnected) {
      return reportMountError(new Error('the canvas container never attached to the document'))
    }
    root = createRoot(container)
    root.render(
      createElement(
        ErrorBoundary,
        {fallback: mountFailedFallback, onError: reportMountError},
        createElement(ThemedExcalidraw, {
          initialData: {elements: []},
          zenModeEnabled: true,
          viewModeEnabled: false,
          isCollaborating: true,
          excalidrawAPI: (instance: ExcalidrawImperativeAPI) => {
            api = instance
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
            unsubscribeScroll = instance.onScrollChange(pushViewport)
            requestAnimationFrame(() => {
              if (!bufferedScene) return
              applyRemote(bufferedScene)
              bufferedScene = undefined
            })
          },
          onChange: (elements: readonly OrderedExcalidrawElement[]) => writeLocal(elements),
          onPointerDown: closeLayersOnCanvasPointer,
        }),
      ),
    )
  }

  onMount(renderExcalidraw)

  onCleanup(() => {
    unsubscribeScroll?.()
    root?.unmount()
  })

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
