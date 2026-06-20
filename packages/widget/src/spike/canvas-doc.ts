import * as Y from 'yjs'
import {IndexeddbPersistence} from 'y-indexeddb'

// Framework-agnostic canvas document: a Yjs doc + our own thin glue. No React, no Solid — both
// frameworks consume this. Excalidraw elements live in a Y.Map keyed by id (granular id-keyed ops,
// never a full-scene overwrite). The origin tags drive the feedback-loop guard: locally-originated
// edits (USER) rebroadcast and enter undo; applied peer edits (REMOTE) and boot loads (REHYDRATE) do
// not. Shared symbols so a relay can skip re-broadcasting an update it just applied.
export const ORIGIN = {
  USER: Symbol('canvas.user'),
  REMOTE: Symbol('canvas.remote'),
  REHYDRATE: Symbol('canvas.rehydrate'),
} as const

export type CanvasElement = {id: string; version: number} & Record<string, unknown>

export type CanvasDoc = {
  doc: Y.Doc
  elements: Y.Map<CanvasElement>
  origin: typeof ORIGIN
  addElement: (el: CanvasElement) => void
  applyRemote: (update: Uint8Array) => void
  count: () => number
  dispose: () => void
}

// IndexedDB is the browser-only offline cache; under node/vitest it is absent, so guard it.
function localCache(roomId: string, doc: Y.Doc): IndexeddbPersistence | null {
  return typeof indexedDB === 'undefined' ? null : new IndexeddbPersistence(roomId, doc)
}

export function createCanvasDoc(roomId: string): CanvasDoc {
  const doc = new Y.Doc()
  const elements = doc.getMap<CanvasElement>('elements')
  const cache = localCache(roomId, doc)
  return {
    doc,
    elements,
    origin: ORIGIN,
    addElement: (el) => doc.transact(() => elements.set(el.id, el), ORIGIN.USER),
    applyRemote: (update) => Y.applyUpdate(doc, update, ORIGIN.REMOTE),
    count: () => elements.size,
    dispose: () => {
      cache?.destroy()
      doc.destroy()
    },
  }
}
