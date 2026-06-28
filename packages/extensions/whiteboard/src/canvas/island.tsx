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

export type Self = {peerId: string; name: string; color: string}

type SceneElement = OrderedExcalidrawElement
type ElementRow = {id: string; elementId: string; data: JsonValue; version: number}
type PendingRow = {id: string; kind: 'skeletons' | 'mermaid'; payload: JsonValue}
type CursorRow = {peerId: string; x: number; y: number; name: string; color: string; lastSeen: Date}

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const CURSOR_THROTTLE_MS = 50
const CURSOR_HEARTBEAT_MS = 5_000
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
  return withStableIds((row.payload as unknown as {elements: ExcalidrawElementSkeleton[]}).elements, row.id)
}

// React error boundary (the ONE class): a bad Excalidraw render can't crash the host widget.
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

// Ported from the Yjs binding (glue.ts / ai-draws.ts / presence.ts), Jazz subscriptions standing in for
// Y.Map observers. Excalidraw owns the live scene; Jazz holds it. A `guard` flag distinguishes our own
// updateScene echo (Jazz has no Yjs `txn.origin`), and the element-version map decides what genuinely
// changed. `applyRemote` only ever calls updateScene — never a Jazz write — so the remote→scene path can
// never re-enter the runtime. Writes happen only from `onChange` (Excalidraw's event), never a reactive
// scope. `room` is constant for this mount; the parent keys the Island by session id.
export function Island(props: {
  doc: Document
  room: string
  theme: 'light' | 'dark'
  self: Self
  visible: boolean
}): JSX.Element {
  const db = useDb()
  let container: HTMLDivElement | undefined
  let root: Root | undefined
  let api: ExcalidrawImperativeAPI | undefined
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

  // AI-draw: convert the pending skeletons and write them as elements — the canvasElements subscription
  // then shows them via applyRemote (exactly like ai-draws.ts wrote into the Y.Map under ORIGIN.AI).
  const draining = new Set<string>()
  const drainPending = async (row: PendingRow): Promise<void> => {
    const drawn = convertToExcalidrawElements(await skeletonsOf(row), {regenerateIds: false})
    await Promise.all(
      drawn.map(async (element: ExcalidrawElement, index: number) =>
        db()
          .upsert(
            app.canvasElements,
            {room: props.room, elementId: element.id, data: asJson(element), version: element.version},
            {id: await stableUuid(`${row.id}:${index}`)},
          )
          .wait({tier: 'edge'}),
      ),
    )
    await db().delete(app.canvasPending, row.id).wait({tier: 'edge'})
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

  let cursorRowId: string | undefined
  let lastCursor = 0
  const writeCursor = (x: number, y: number): void => {
    const now = Date.now()
    if (now - lastCursor < CURSOR_THROTTLE_MS) return
    lastCursor = now
    if (!cursorRowId) {
      cursorRowId = db().insert(app.cursors, {
        room: props.room,
        peerId: props.self.peerId,
        x,
        y,
        name: props.self.name,
        color: props.self.color,
        lastSeen: new Date(),
      }).value.id
      return
    }
    db().update(app.cursors, cursorRowId, {x, y, lastSeen: new Date()})
  }

  const unsubscribeScene = db().subscribeAll(app.canvasElements.where({room: props.room}), ({all}) =>
    applyRemote(all as readonly ElementRow[]),
  )
  const unsubscribePending = db().subscribeAll(app.canvasPending.where({room: props.room}), ({all}) =>
    (all as readonly PendingRow[]).forEach((row) => {
      if (draining.has(row.id)) return
      draining.add(row.id)
      void drainPending(row)
    }),
  )
  const unsubscribeCursors = db().subscribeAll(app.cursors.where({room: props.room}), ({all}) =>
    api?.updateScene({collaborators: collaboratorsFrom(all as readonly CursorRow[])}),
  )
  const heartbeat = setInterval(() => {
    if (cursorRowId) db().update(app.cursors, cursorRowId, {lastSeen: new Date()})
  }, CURSOR_HEARTBEAT_MS)
  onCleanup(() => {
    unsubscribeScene()
    unsubscribePending()
    unsubscribeCursors()
    clearInterval(heartbeat)
    if (cursorRowId) db().delete(app.cursors, cursorRowId)
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
            if (bufferedScene) {
              applyRemote(bufferedScene)
              bufferedScene = undefined
            }
          },
          onChange: (elements: readonly OrderedExcalidrawElement[]) => writeLocal(elements),
          onPointerUpdate: (payload: {pointer: {x: number; y: number}}) =>
            writeCursor(payload.pointer.x, payload.pointer.y),
        }),
      ),
    )
  })
  onCleanup(() => root?.unmount())

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
