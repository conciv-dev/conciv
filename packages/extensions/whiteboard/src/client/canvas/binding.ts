import {createEffect} from 'solid-js'
import {useAll, useDb} from 'jazz-tools/solid'
import type {JsonValue} from 'jazz-tools'
import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {app} from '../../shared/schema.js'
import type {IslandHandle} from '../../canvas/island-types.js'

type JazzDb = ReturnType<ReturnType<typeof useDb>>
type SceneElement = OrderedExcalidrawElement
type PendingRow = {id: string; kind: 'skeletons' | 'mermaid'; payload: JsonValue}
type ElementRow = {id: string; elementId: string; data: JsonValue; version: number}

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'
const asScene = (data: JsonValue): SceneElement => data as unknown as SceneElement
const asJson = (element: SceneElement): JsonValue => element as unknown as JsonValue

async function skeletonsOf(row: PendingRow): Promise<ExcalidrawElementSkeleton[]> {
  if (row.kind === 'mermaid') {
    const {parseMermaidToExcalidraw} = await import('@excalidraw/mermaid-to-excalidraw')
    const {source} = row.payload as unknown as {source: string}
    return (await parseMermaidToExcalidraw(source, {maxEdges: 500})).elements
  }
  return (row.payload as unknown as {elements: ExcalidrawElementSkeleton[]}).elements
}

async function drainPending(db: JazzDb, room: string, row: PendingRow): Promise<void> {
  const {convertToExcalidrawElements} = await import('@excalidraw/excalidraw')
  const elements = convertToExcalidrawElements(await skeletonsOf(row), {regenerateIds: true})
  await Promise.all(
    elements.map((element) =>
      db
        .insert(app.canvasElements, {room, elementId: element.id, data: asJson(element), version: element.version})
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
  const guard = {applyingRemote: false}
  const draining = new Set<string>()

  createEffect(() => {
    const rows = elements.data
    if (!rows) return
    guard.applyingRemote = true
    opts.handle.updateScene({
      elements: rows.map((row) => asScene((row as ElementRow).data)),
      captureUpdate: CAPTURE_NEVER,
    })
    guard.applyingRemote = false
  })

  createEffect(() => {
    const rows = pending.data
    if (!rows) return
    rows.forEach((row) => {
      const pendingRow = row as PendingRow
      if (draining.has(pendingRow.id)) return
      draining.add(pendingRow.id)
      void drainPending(db(), opts.room(), pendingRow)
    })
  })

  return (next: readonly SceneElement[]): void => {
    if (guard.applyingRemote) return
    const current = (elements.data ?? []) as ElementRow[]
    const byElementId = new Map(current.map((row) => [row.elementId, row]))
    const nextIds = new Set(next.map((element) => element.id))
    next.forEach((element) => {
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
    current.filter((row) => !nextIds.has(row.elementId)).forEach((row) => db().delete(app.canvasElements, row.id))
  }
}
