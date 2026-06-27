import {createEffect} from 'solid-js'
import {convertToExcalidrawElements} from '@excalidraw/excalidraw'
import {useAll, useDb} from 'jazz-tools/solid'
import type {JsonValue} from 'jazz-tools'
import type {Db} from 'jazz-tools/backend'
import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {app} from '../../shared/schema.js'
import type {IslandHandle} from '../../canvas/island-types.js'

type SceneElement = OrderedExcalidrawElement
type PendingRow = {id: string; kind: 'skeletons' | 'mermaid'; payload: JsonValue}

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const asScene = (data: JsonValue): SceneElement => data as unknown as SceneElement
const asJson = (element: ExcalidrawElement): JsonValue => element as unknown as JsonValue

const toUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

const stableUuid = async (seed: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(seed)))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
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

async function drainPending(db: Db, room: string, row: PendingRow): Promise<void> {
  const elements = convertToExcalidrawElements(await skeletonsOf(row), {regenerateIds: false})
  await Promise.all(
    elements.map(async (element: ExcalidrawElement, index: number) =>
      db
        .upsert(
          app.canvasElements,
          {room, elementId: element.id, data: asJson(element), version: element.version},
          {id: await stableUuid(`${row.id}:${index}`)},
        )
        .wait({tier: 'edge'}),
    ),
  )
  await db.delete(app.canvasPending, row.id).wait({tier: 'edge'})
}

export function useCanvasBinding(opts: {
  handle: IslandHandle
  room: () => string
}): (next: readonly SceneElement[]) => void {
  const db = useDb()
  const elements = useAll(() => ({query: app.canvasElements.where({room: opts.room()})}))
  const pending = useAll(() => ({query: app.canvasPending.where({room: opts.room()})}))
  const appliedRemote = new Map<string, number>()
  const draining = new Set<string>()

  createEffect(() => {
    const rows = elements.data
    if (!rows) return
    appliedRemote.clear()
    rows.forEach((row) => appliedRemote.set(row.elementId, row.version))
    opts.handle.updateScene({
      elements: rows.map((row) => asScene(row.data)),
      captureUpdate: CAPTURE_NEVER,
    })
  })

  createEffect(() => {
    const rows = pending.data
    if (!rows) return
    rows.forEach((row) => {
      if (draining.has(row.id)) return
      draining.add(row.id)
      void drainPending(db(), opts.room(), row)
    })
  })

  return (next: readonly SceneElement[]): void => {
    const current = elements.data ?? []
    const byElementId = new Map(current.map((row) => [row.elementId, row]))
    const live = next.filter((element) => !element.isDeleted)
    const liveIds = new Set(live.map((element) => element.id))
    live.forEach((element) => {
      if (appliedRemote.get(element.id) === element.version) return
      const existing = byElementId.get(element.id)
      if (!existing)
        return void db().insert(app.canvasElements, {
          room: opts.room(),
          elementId: element.id,
          data: asJson(element),
          version: element.version,
        })
      if (existing.version !== element.version)
        db().update(app.canvasElements, existing.id, {data: asJson(element), version: element.version})
    })
    current.filter((row) => !liveIds.has(row.elementId)).forEach((row) => db().delete(app.canvasElements, row.id))
  }
}
