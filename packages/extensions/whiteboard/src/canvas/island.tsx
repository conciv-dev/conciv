import {createEffect, createSignal, onCleanup, onMount, Show, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {Component, createElement, type ReactNode} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {Excalidraw, THEME, convertToExcalidrawElements} from '@excalidraw/excalidraw'
import type {Collaborator, ExcalidrawImperativeAPI, SocketId} from '@excalidraw/excalidraw/types'
import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {useWhiteboardDb} from '../client/db.js'
import type {CursorEvent, ElementRow, JsonValue, PendingRow} from '../shared/rows.js'
import {replayDraft, type ReplayHandle, type ReplayStep} from './replay.js'
import {sceneToScreen, type Viewport} from './coords.js'

type AuthorChip = {label: string; kind: 'human' | 'ai'; x: number; y: number}

const authorLabel = (row: ElementRow): string =>
  row.ownerKind === 'ai' ? (row.ownerModel ? `AI · ${row.ownerModel}` : 'AI') : (row.ownerName ?? 'Guest')

export type Self = {peerId: string; name: string; color: string}

type SceneElement = OrderedExcalidrawElement

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const CURSOR_STALE_MS = 15_000
const asScene = (data: JsonValue): SceneElement => data as unknown as SceneElement
const asJson = (element: ExcalidrawElement): JsonValue => element as unknown as JsonValue
const pendingModel = (payload: JsonValue): string | null => {
  const value: {model: unknown} = Object.assign({model: null}, payload)
  return typeof value.model === 'string' ? value.model : null
}

const withStableIds = (skeletons: ExcalidrawElementSkeleton[], rowId: string): ExcalidrawElementSkeleton[] =>
  skeletons.map((skeleton, index) => (skeleton.id ? skeleton : {...skeleton, id: `${rowId}-${index}`}))

async function skeletonsOf(row: PendingRow): Promise<ExcalidrawElementSkeleton[]> {
  if (row.kind === 'mermaid') {
    const {parseMermaidToExcalidraw} = await import('@excalidraw/mermaid-to-excalidraw')
    const {source} = row.payload as unknown as {source: string}
    return withStableIds((await parseMermaidToExcalidraw(source, {maxEdges: 500})).elements, row.id)
  }
  if (row.kind === 'svg') {
    const {svgToSkeletons} = await import('./svg-convert.js')
    const {svg, x, y, width, roughness} = row.payload as unknown as {
      svg: string
      x: number
      y: number
      width: number
      roughness: number
    }
    return withStableIds(svgToSkeletons(svg, {x, y, width, roughness}), row.id)
  }
  return withStableIds((row.payload as unknown as {elements: ExcalidrawElementSkeleton[]}).elements, row.id)
}

class IslandBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  override state = {failed: false}
  static getDerivedStateFromError(): {failed: boolean} {
    return {failed: true}
  }
  override render(): ReactNode {
    if (this.state.failed) return createElement('div', {'data-whiteboard-error': ''}, 'canvas failed')
    return this.props.children
  }
}

export function Island(props: {
  doc: Document
  room: string
  theme: 'light' | 'dark'
  self: Self
  visible: boolean
  onViewport?: (viewport: Viewport) => void
  registerPan?: (panToScene: (sceneX: number, sceneY: number) => void) => void
}): JSX.Element {
  const db = useWhiteboardDb()
  let container: HTMLDivElement | undefined
  let root: Root | undefined
  let api: ExcalidrawImperativeAPI | undefined
  let unsubscribeScroll: (() => void) | undefined
  const guard = {applyingRemote: false}
  const versions = new Map<string, number>()
  let bufferedScene: readonly ElementRow[] | undefined
  const [chip, setChip] = createSignal<AuthorChip | null>(null)

  const soleSelectedId = (ids: Readonly<Record<string, boolean>>): string | undefined => {
    const active = Object.entries(ids).filter(([, on]) => on)
    return active.length === 1 ? active[0]?.[0] : undefined
  }

  const selectedRow = (elementId: string | undefined): ElementRow | undefined =>
    elementId ? db.canvasElements.state.get(elementId) : undefined

  const refreshChip = (): void => {
    if (!api) return void setChip(null)
    const state = api.getAppState()
    const selectedId = soleSelectedId(state.selectedElementIds)
    const element = api.getSceneElements().find((candidate: SceneElement) => candidate.id === selectedId)
    const row = selectedRow(selectedId)
    if (!element || !row) return void setChip(null)
    const viewport: Viewport = {
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      zoom: state.zoom,
      offsetLeft: state.offsetLeft,
      offsetTop: state.offsetTop,
    }
    const point = sceneToScreen(viewport, element.x, element.y)
    setChip({label: authorLabel(row), kind: row.ownerKind, x: point.x, y: point.y - 6})
  }

  const humanAuthor = () => ({
    ownerKind: 'human' as const,
    ownerId: props.self.peerId,
    ownerName: props.self.name,
    ownerModel: null,
    lastEditedByKind: 'human' as const,
    lastEditedById: props.self.peerId,
    lastEditedByName: props.self.name,
    lastEditedByModel: null,
  })
  const aiAuthor = (model: string | null) => ({
    ownerKind: 'ai' as const,
    ownerId: null,
    ownerName: null,
    ownerModel: model,
    lastEditedByKind: 'ai' as const,
    lastEditedById: null,
    lastEditedByName: null,
    lastEditedByModel: model,
  })

  const applyRemote = (rows: readonly ElementRow[]): void => {
    if (!api) {
      bufferedScene = rows
      return
    }
    const incoming = new Set(rows.map((row) => row.elementId))
    const remoteChanged =
      rows.some((row) => (versions.get(row.elementId) ?? -1) < row.version) ||
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
      api.updateScene({elements: rows.map((row) => asScene(row.data)), captureUpdate: CAPTURE_NEVER})
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
        ...humanAuthor(),
      })
    })
  }

  const draining = new Set<string>()
  const drainPending = async (row: PendingRow): Promise<void> => {
    try {
      const drawn = convertToExcalidrawElements(await skeletonsOf(row), {regenerateIds: false})
      const rows = drawn.map((element: ExcalidrawElement) => ({
        room: props.room,
        elementId: element.id,
        data: asJson(element),
        version: element.version,
        ...aiAuthor(pendingModel(row.payload)),
      }))
      const scope = row.stage === 'draft' ? 'draft' : 'live'
      await db.bulkUpsertElements(scope, rows)
    } catch (error) {
      console.error(`[whiteboard] draining pending ${row.kind} ${row.id} failed: ${String(error)}`)
    } finally {
      db.canvasPending.delete(row.id)
    }
  }

  const agentPeerId = `agent:${props.room}`
  const agentCursor = (x: number, y: number): void =>
    db.postCursor({peerId: agentPeerId, kind: 'agent', name: 'drawing…', color: '#8a86e8', x, y})

  const commitStep = (draft: ElementRow): ReplayStep => {
    const data = draft.data as unknown as {x?: number; y?: number}
    return {
      elementId: draft.elementId,
      x: data.x ?? 0,
      y: data.y ?? 0,
      write: (): void =>
        db.canvasElements.utils.write({
          room: props.room,
          elementId: draft.elementId,
          data: draft.data,
          version: draft.version,
          ownerKind: draft.ownerKind,
          ownerId: draft.ownerId,
          ownerName: draft.ownerName,
          ownerModel: draft.ownerModel,
          lastEditedByKind: draft.lastEditedByKind,
          lastEditedById: draft.lastEditedById,
          lastEditedByName: draft.lastEditedByName,
          lastEditedByModel: draft.lastEditedByModel,
        }),
    }
  }

  const clearDraftRows = (ordered: readonly ElementRow[]): void =>
    ordered.forEach((draft) => db.canvasDraftElements.delete(draft.elementId))

  const performCommit = async (row: PendingRow): Promise<void> => {
    await db.canvasDraftElements.preload()
    const ordered = [...db.canvasDraftElements.state.values()]
    let handle: ReplayHandle | undefined
    const onPointerDown = (): void => handle?.skip()
    try {
      const steps = ordered.map(commitStep)
      container?.addEventListener('pointerdown', onPointerDown, {once: true})
      handle = replayDraft(steps, (x, y) => agentCursor(x, y))
      await handle.done
      clearDraftRows(ordered)
    } catch (error) {
      console.error(`[whiteboard] performCommit ${row.id} failed: ${String(error)}`)
    } finally {
      container?.removeEventListener('pointerdown', onPointerDown)
      db.canvasPending.delete(row.id)
    }
  }

  const toBase64 = (bytes: Uint8Array): string => {
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    }
    return btoa(binary)
  }

  const liveExportElements = (scope: 'live' | 'draft' | 'both'): readonly SceneElement[] =>
    scope === 'draft' ? [] : (api?.getSceneElements() ?? [])

  const draftExportElements = async (scope: 'live' | 'draft' | 'both'): Promise<SceneElement[]> => {
    if (scope === 'live') return []
    await db.canvasDraftElements.preload()
    return [...db.canvasDraftElements.state.values()].map((draft) => asScene(draft.data))
  }

  const gatherExportElements = async (scope: 'live' | 'draft' | 'both'): Promise<SceneElement[]> => [
    ...liveExportElements(scope),
    ...(await draftExportElements(scope)),
  ]

  const exportReply = async (scope: 'live' | 'draft' | 'both'): Promise<JsonValue> => {
    const elements = await gatherExportElements(scope)
    const {exportToBlob} = await import('@excalidraw/excalidraw')
    const blob = await exportToBlob({
      elements,
      files: api?.getFiles() ?? {},
      appState: {exportBackground: true, viewBackgroundColor: '#ffffff'},
    })
    return {dataBase64: toBase64(new Uint8Array(await blob.arrayBuffer()))}
  }

  const performExport = async (row: PendingRow): Promise<void> => {
    const {requestId, scope} = row.payload as unknown as {requestId: string; scope: 'live' | 'draft' | 'both'}
    const payload = await exportReply(scope).catch((error) => {
      console.error(`[whiteboard] canvas.export render failed: ${String(error)}`)
      return {error: 'export render failed', reason: String(error)}
    })
    try {
      db.canvasReplies.insert({id: crypto.randomUUID(), room: props.room, requestId, kind: 'export', payload})
    } finally {
      db.canvasPending.delete(row.id)
    }
  }

  const collaboratorsFrom = (rows: readonly CursorEvent[]): Map<SocketId, Collaborator> => {
    const now = Date.now()
    const map = new Map<SocketId, Collaborator>()
    rows
      .filter((cursor) => cursor.peerId !== props.self.peerId)
      .filter((cursor) => now - cursor.lastSeen < CURSOR_STALE_MS)
      .forEach((cursor) =>
        map.set(cursor.peerId as SocketId, {
          username: cursor.name,
          color: {background: cursor.color, stroke: cursor.color},
          pointer: {x: cursor.x, y: cursor.y, tool: 'pointer'},
        }),
      )
    return map
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
  const drainRow = (row: PendingRow): void => {
    if (draining.has(row.id)) return
    const handler = pendingHandlers[row.kind]
    if (!handler) return
    draining.add(row.id)
    void handler(row)
  }
  const pendingSubscription = db.canvasPending.subscribeChanges(
    () => [...db.canvasPending.state.values()].forEach(drainRow),
    {includeInitialState: true},
  )

  createEffect(() => api?.updateScene({collaborators: collaboratorsFrom([...db.cursors().values()])}))

  onCleanup(() => {
    sceneSubscription.unsubscribe()
    pendingSubscription.unsubscribe()
  })

  onMount(() => {
    if (!container) return
    root = createRoot(container)
    root.render(
      createElement(
        IslandBoundary,
        null,
        createElement(Excalidraw, {
          initialData: {elements: [], appState: {viewBackgroundColor: 'transparent'}},
          zenModeEnabled: true,
          viewModeEnabled: false,
          theme: props.theme === 'dark' ? THEME.DARK : THEME.LIGHT,
          isCollaborating: true,
          excalidrawAPI: (instance: ExcalidrawImperativeAPI) => {
            api = instance
            const pushViewport = (): void => {
              const state = instance.getAppState()
              props.onViewport?.({
                scrollX: state.scrollX,
                scrollY: state.scrollY,
                zoom: state.zoom,
                offsetLeft: state.offsetLeft,
                offsetTop: state.offsetTop,
              })
            }
            pushViewport()
            unsubscribeScroll = instance.onScrollChange(() => {
              pushViewport()
              refreshChip()
            })
            props.registerPan?.((sceneX, sceneY) => {
              const state = instance.getAppState()
              instance.updateScene({
                appState: {
                  scrollX: state.width / (2 * state.zoom.value) - sceneX,
                  scrollY: state.height / (2 * state.zoom.value) - sceneY,
                },
                captureUpdate: CAPTURE_NEVER,
              })
            })
            requestAnimationFrame(() => {
              if (!bufferedScene) return
              applyRemote(bufferedScene)
              bufferedScene = undefined
            })
          },
          onChange: (elements: readonly OrderedExcalidrawElement[]) => {
            writeLocal(elements)
            refreshChip()
          },
        }),
      ),
    )
  })
  onCleanup(() => {
    unsubscribeScroll?.()
    root?.unmount()
  })

  return (
    <Portal mount={props.doc.body}>
      <div
        ref={(element) => (container = element)}
        style={{
          position: 'fixed',
          inset: '0',
          'z-index': '2147482000',
          visibility: props.visible ? 'visible' : 'hidden',
        }}
      />
      <Show when={props.visible && chip()}>
        {(current) => (
          <div
            aria-label={`Drawn by ${current().label}`}
            style={{
              position: 'fixed',
              left: `${current().x}px`,
              top: `${current().y}px`,
              transform: 'translateY(-100%)',
              'z-index': '2147482001',
              'pointer-events': 'none',
              background: current().kind === 'ai' ? '#8a86e8' : '#334155',
              color: '#ffffff',
              padding: '2px 8px',
              'border-radius': '999px',
              'font-size': '11px',
              'font-weight': '600',
              'white-space': 'nowrap',
              'box-shadow': '0 1px 3px rgba(0, 0, 0, 0.3)',
            }}
          >
            {current().label}
          </div>
        )}
      </Show>
    </Portal>
  )
}
