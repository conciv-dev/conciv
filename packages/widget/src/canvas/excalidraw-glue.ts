import {CaptureUpdateAction} from '@excalidraw/excalidraw'
import type {CanvasDoc, CanvasElement} from './canvas-doc.js'

// Minimal slice of Excalidraw's imperative API we use — avoids coupling to 0.18 internal type paths.
type ExcalidrawApi = {
  updateScene: (scene: {elements: readonly CanvasElement[]; captureUpdate?: unknown}) => void
  onChange: (cb: (elements: readonly CanvasElement[]) => void) => () => void
}

// Our own Yjs <-> Excalidraw glue (no third-party binding), both directions, loop-guarded:
// Yjs -> Excalidraw applies every change except ones Excalidraw itself made (ORIGIN.EXCALIDRAW);
// Excalidraw -> Yjs writes only version-changed elements, tagged ORIGIN.EXCALIDRAW so they don't bounce.
export function bindExcalidraw(doc: CanvasDoc, api: ExcalidrawApi): () => void {
  const toScene = () =>
    api.updateScene({elements: [...doc.elements.values()], captureUpdate: CaptureUpdateAction.NEVER})
  toScene()
  const onYjs = (_event: unknown, txn: {origin: unknown}) => {
    if (txn.origin !== doc.origin.EXCALIDRAW) toScene()
  }
  doc.elements.observe(onYjs)
  const offExcalidraw = api.onChange((elements) => {
    const changed = elements.filter((el) => doc.elements.get(el.id)?.version !== el.version)
    if (changed.length === 0) return
    doc.doc.transact(() => {
      for (const el of changed) doc.elements.set(el.id, {...el})
    }, doc.origin.EXCALIDRAW)
  })
  return () => {
    doc.elements.unobserve(onYjs)
    offExcalidraw()
  }
}
