import {onCleanup, onMount, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {Component, createElement, type ReactNode} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {Excalidraw, THEME, convertToExcalidrawElements} from '@excalidraw/excalidraw'
import {useDb} from 'jazz-tools/solid'
import type {JsonValue} from 'jazz-tools'
import type {Collaborator, ExcalidrawImperativeAPI, SocketId} from '@excalidraw/excalidraw/types'
import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {app} from '../shared/schema.js'
import {replayDraft, type ReplayHandle, type ReplayStep} from './replay.js'
import type {Viewport} from './coords.js'

export type Self = {peerId: string; name: string; color: string}

type SceneElement = OrderedExcalidrawElement
type ElementRow = {id: string; elementId: string; data: JsonValue; version: number}
type PendingRow = {
  id: string
  kind: 'skeletons' | 'mermaid' | 'svg' | 'export' | 'commit' | 'discard'
  stage?: 'draft' | 'live'
  payload: JsonValue
}
type CursorRow = {
  id: string
  peerId: string
  kind?: 'human' | 'agent'
  x: number
  y: number
  name: string
  color: string
  lastSeen: Date
}

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const CURSOR_STALE_MS = 15_000
const asScene = (data: JsonValue): SceneElement => data as unknown as SceneElement
const asJson = (element: ExcalidrawElement): JsonValue => element as unknown as JsonValue

const toUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

const stableUuid = async (seed: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(seed)))
  const bytes = digest.slice(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  return toUuid(bytes)
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
  const db = useDb()
  let container: HTMLDivElement | undefined
  let root: Root | undefined
  let api: ExcalidrawImperativeAPI | undefined
  let unsubscribeScroll: (() => void) | undefined
  const guard = {applyingRemote: false}
  const versions = new Map<string, number>()
  const rowIds = new Map<string, string>()
  let bufferedScene: readonly ElementRow[] | undefined

  const applyRemote = (rows: readonly ElementRow[]): void => {
    if (!api) {
      bufferedScene = rows
      return
    }
    const incoming = new Set(rows.map((row) => row.elementId))
    const remoteChanged =
      rows.some((row) => (versions.get(row.elementId) ?? -1) < row.version) ||
      [...versions.keys()].some((elementId) => !incoming.has(elementId))
    rowIds.clear()
    versions.forEach((_version, elementId) => {
      if (!incoming.has(elementId)) versions.delete(elementId)
    })
    rows.forEach((row) => {
      rowIds.set(row.elementId, row.id)
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
      const rowId = rowIds.get(element.id)
      if (!rowId) {
        const {value} = db().insert(app.canvasElements, {
          room: props.room,
          elementId: element.id,
          data: asJson(element),
          version: element.version,
        })
        rowIds.set(element.id, value.id)
        return
      }
      db().update(app.canvasElements, rowId, {data: asJson(element), version: element.version})
    })
  }

  const draining = new Set<string>()
  const drainPending = async (row: PendingRow): Promise<void> => {
    const targetTable = row.stage === 'draft' ? app.canvasDraftElements : app.canvasElements
    try {
      const drawn = convertToExcalidrawElements(await skeletonsOf(row), {regenerateIds: false})
      const rows = await Promise.all(
        drawn.map(async (element: ExcalidrawElement, index: number) => ({
          id: await stableUuid(`${row.id}:${index}`),
          data: {room: props.room, elementId: element.id, data: asJson(element), version: element.version},
        })),
      )
      await db()
        .batch((batch) =>
          rows.forEach((entry: (typeof rows)[number]) => batch.upsert(targetTable, entry.data, {id: entry.id})),
        )
        .wait({tier: 'edge'})
    } catch (error) {
      console.error(`[whiteboard] draining pending ${row.kind} ${row.id} failed: ${String(error)}`)
    } finally {
      await db()
        .delete(app.canvasPending, row.id)
        .wait({tier: 'edge'})
        .catch((error) => console.error(`[whiteboard] deleting pending ${row.id} failed: ${String(error)}`))
    }
  }

  const agentPeerId = `agent:${props.room}`
  const ensureAgentCursor = async (x: number, y: number): Promise<string> => {
    const existing = (await db().all(app.cursors.where({room: props.room, peerId: agentPeerId}), {tier: 'global'}))[0]
    if (existing) {
      await db().update(app.cursors, existing.id, {x, y, lastSeen: new Date()}).wait({tier: 'edge'})
      return existing.id
    }
    const write = db().insert(app.cursors, {
      room: props.room,
      peerId: agentPeerId,
      kind: 'agent',
      name: 'drawing…',
      color: '#8a86e8',
      x,
      y,
      lastSeen: new Date(),
    })
    await write.wait({tier: 'edge'})
    return write.value.id
  }

  const moveAgentCursor = (cursorId: string, x: number, y: number): void =>
    void db()
      .update(app.cursors, cursorId, {x, y, lastSeen: new Date()})
      .wait({tier: 'edge'})
      .catch((error) => console.error(`[whiteboard] agent cursor move failed: ${String(error)}`))

  const commitStep = async (draft: ElementRow): Promise<ReplayStep> => {
    const data = draft.data as unknown as {x?: number; y?: number}
    const liveId = await stableUuid(`commit:${draft.id}`)
    return {
      elementId: draft.elementId,
      x: data.x ?? 0,
      y: data.y ?? 0,
      write: (): void =>
        void db()
          .upsert(
            app.canvasElements,
            {room: props.room, elementId: draft.elementId, data: draft.data, version: draft.version},
            {id: liveId},
          )
          .wait({tier: 'edge'})
          .catch((error) => console.error(`[whiteboard] commit element write failed: ${String(error)}`)),
    }
  }

  const clearDraftRows = (ordered: readonly ElementRow[]): Promise<unknown> =>
    db()
      .batch((batch) => ordered.forEach((draft) => batch.delete(app.canvasDraftElements, draft.id)))
      .wait({tier: 'edge'})
      .catch((error) => console.error(`[whiteboard] commit draft cleanup failed: ${String(error)}`))

  const performCommit = async (row: PendingRow): Promise<void> => {
    const drafts = await db().all(app.canvasDraftElements.where({room: props.room}), {tier: 'global'})
    const ordered = drafts.map((draft) => draft as unknown as ElementRow)
    let handle: ReplayHandle | undefined
    const onPointerDown = (): void => handle?.skip()
    try {
      const steps = await Promise.all(ordered.map(commitStep))
      const cursorId = await ensureAgentCursor(steps[0]?.x ?? 0, steps[0]?.y ?? 0).catch((error) => {
        console.error(`[whiteboard] agent cursor create failed: ${String(error)}`)
        return undefined
      })
      container?.addEventListener('pointerdown', onPointerDown, {once: true})
      handle = replayDraft(steps, (x, y) => (cursorId ? moveAgentCursor(cursorId, x, y) : undefined))
      await handle.done
      await clearDraftRows(ordered)
    } catch (error) {
      console.error(`[whiteboard] performCommit ${row.id} failed: ${String(error)}`)
    } finally {
      container?.removeEventListener('pointerdown', onPointerDown)
      await db()
        .delete(app.canvasPending, row.id)
        .wait({tier: 'edge'})
        .catch((error) => console.error(`[whiteboard] deleting commit pending ${row.id} failed: ${String(error)}`))
    }
  }

  const toBase64 = (bytes: Uint8Array): string => {
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    }
    return btoa(binary)
  }

  const gatherExportElements = async (scope: 'live' | 'draft' | 'both'): Promise<SceneElement[]> => {
    const live = scope === 'draft' ? [] : (api?.getSceneElements() ?? [])
    const draftRows =
      scope === 'live' ? [] : await db().all(app.canvasDraftElements.where({room: props.room}), {tier: 'global'})
    return [...live, ...draftRows.map((draft) => asScene((draft as unknown as ElementRow).data))]
  }

  const exportReply = async (scope: 'live' | 'draft' | 'both'): Promise<JsonValue> => {
    const elements = await gatherExportElements(scope)
    const {exportToBlob} = await import('@excalidraw/excalidraw')
    const blob = await exportToBlob({
      elements,
      files: api?.getFiles() ?? {},
      appState: {exportBackground: true, viewBackgroundColor: '#ffffff'},
    })
    return {dataBase64: toBase64(new Uint8Array(await blob.arrayBuffer()))} as JsonValue
  }

  const performExport = async (row: PendingRow): Promise<void> => {
    const {requestId, scope} = row.payload as unknown as {requestId: string; scope: 'live' | 'draft' | 'both'}
    const payload = await exportReply(scope).catch((error) => {
      console.error(`[whiteboard] canvas.export render failed: ${String(error)}`)
      return {error: 'export render failed', reason: String(error)} as JsonValue
    })
    try {
      await db().insert(app.canvasReplies, {room: props.room, requestId, kind: 'export', payload}).wait({tier: 'edge'})
    } finally {
      await db()
        .delete(app.canvasPending, row.id)
        .wait({tier: 'edge'})
        .catch((error) => console.error(`[whiteboard] deleting export pending ${row.id} failed: ${String(error)}`))
    }
  }

  const collaboratorsFrom = (rows: readonly CursorRow[]): Map<SocketId, Collaborator> => {
    const now = Date.now()
    const map = new Map<SocketId, Collaborator>()
    rows
      .filter((cursor) => cursor.peerId !== props.self.peerId)
      .filter((cursor) => now - cursor.lastSeen.getTime() < CURSOR_STALE_MS)
      .forEach((cursor) =>
        map.set(cursor.peerId as SocketId, {
          username: cursor.name,
          color: {background: cursor.color, stroke: cursor.color},
          pointer: {x: cursor.x, y: cursor.y, tool: 'pointer'},
        }),
      )
    return map
  }

  const unsubscribeScene = db().subscribeAll(app.canvasElements.where({room: props.room}), ({all}) =>
    applyRemote(all as readonly ElementRow[]),
  )
  const unsubscribePending = db().subscribeAll(app.canvasPending.where({room: props.room}), ({all}) =>
    (all as readonly PendingRow[]).forEach((row) => {
      if (draining.has(row.id)) return
      const drawable = row.kind === 'skeletons' || row.kind === 'mermaid' || row.kind === 'svg'
      if (!drawable && row.kind !== 'commit' && row.kind !== 'export') return
      draining.add(row.id)
      if (row.kind === 'commit') return void performCommit(row)
      if (row.kind === 'export') return void performExport(row)
      void drainPending(row)
    }),
  )

  let latestCursors: readonly CursorRow[] = []
  const unsubscribeCursors = db().subscribeAll(app.cursors.where({room: props.room}), ({all}) => {
    latestCursors = all as readonly CursorRow[]
    api?.updateScene({collaborators: collaboratorsFrom(latestCursors)})
  })
  const sweepAgents = setInterval(() => {
    const now = Date.now()
    latestCursors
      .filter((cursor) => cursor.kind === 'agent' && now - cursor.lastSeen.getTime() > CURSOR_STALE_MS)
      .forEach((cursor) => db().delete(app.cursors, cursor.id))
  }, CURSOR_STALE_MS)
  onCleanup(() => {
    unsubscribeScene()
    unsubscribePending()
    unsubscribeCursors()
    clearInterval(sweepAgents)
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
            unsubscribeScroll = instance.onScrollChange(() => pushViewport())
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
            if (bufferedScene) {
              applyRemote(bufferedScene)
              bufferedScene = undefined
            }
          },
          onChange: (elements: readonly OrderedExcalidrawElement[]) => writeLocal(elements),
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
    </Portal>
  )
}
