import * as Y from 'yjs'
import {ORIGIN, type SnapshotStore, type SyncEngine, type SyncRoom} from '@mandarax/protocol/sync-types'

export type SyncEngineOptions = {store: SnapshotStore; saveDebounceMs?: number}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}

function createRoom(roomId: string, opts: SyncEngineOptions): SyncRoom {
  const doc = new Y.Doc()
  const observers = new Set<(update: Uint8Array, origin: unknown) => void>()
  const persist = debounce(() => {
    opts.store.save(roomId, Y.encodeStateAsUpdate(doc)).catch(() => {})
  }, opts.saveDebounceMs ?? 50)
  doc.on('update', (update, origin) => {
    for (const observe of observers) observe(update, origin)
    if (origin !== ORIGIN.REHYDRATE) persist()
  })
  opts.store
    .load(roomId)
    .then((saved) => {
      if (saved) Y.applyUpdate(doc, saved, ORIGIN.REHYDRATE)
    })
    .catch(() => {})
  return {
    doc,
    observe: (cb) => {
      observers.add(cb)
      return () => observers.delete(cb)
    },
    apply: (update, origin) => Y.applyUpdate(doc, update, origin),
    snapshot: () => Y.encodeStateAsUpdate(doc),
  }
}

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const rooms = new Map<string, SyncRoom>()
  return {
    room: (roomId) => {
      const existing = rooms.get(roomId)
      if (existing) return existing
      const room = createRoom(roomId, opts)
      rooms.set(roomId, room)
      return room
    },
  }
}
