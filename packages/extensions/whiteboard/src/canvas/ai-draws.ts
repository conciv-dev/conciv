import type * as Y from 'yjs'
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'
import {ELEMENTS_KEY, ORIGIN, PENDING_KEY} from '../room.js'
import type {SceneElement} from './glue.js'

type PendingDraw = {kind: 'skeletons'; elements: ExcalidrawElementSkeleton[]} | {kind: 'mermaid'; source: string}

async function skeletonsOf(entry: PendingDraw): Promise<ExcalidrawElementSkeleton[]> {
  if (entry.kind === 'skeletons') return entry.elements
  const {parseMermaidToExcalidraw} = await import('@excalidraw/mermaid-to-excalidraw')
  const result = await parseMermaidToExcalidraw(entry.source, {maxEdges: 500})
  return result.elements
}

export function bindAiDraws(doc: Y.Doc): () => void {
  const pending = doc.getMap<PendingDraw>(PENDING_KEY)
  const inflight = new Set<string>()

  const convert = async (id: string, entry: PendingDraw): Promise<void> => {
    const {convertToExcalidrawElements} = await import('@excalidraw/excalidraw')
    const els: SceneElement[] = convertToExcalidrawElements(await skeletonsOf(entry), {regenerateIds: true})
    doc.transact(() => {
      const map = doc.getMap<SceneElement>(ELEMENTS_KEY)
      els.forEach((el) => map.set(el.id, el))
      pending.delete(id)
    }, ORIGIN.AI)
    inflight.delete(id)
  }

  const drain = (): void => {
    pending.forEach((entry, id) => {
      if (inflight.has(id)) return
      inflight.add(id)
      void convert(id, entry)
    })
  }

  pending.observe(drain)
  drain()
  return () => pending.unobserve(drain)
}
