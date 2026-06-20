import * as Y from 'yjs'
import type {CanvasStore} from './canvas-store.js'

// Core holds the authoritative Y.Doc per session (multi-master CRDT — the .ybin is the durable
// snapshot, not "the authority"). Clients sync opaque updates through this relay: applyUpdate merges
// + broadcasts to every subscriber (Yjs applyUpdate is idempotent, so echoing to the sender is a
// harmless no-op), and edits are persisted to the store debounced. Rehydrate uses its own origin so a
// boot load never rebroadcasts.
const REHYDRATE = Symbol('relay.rehydrate')
const PERSIST_DEBOUNCE_MS = 400

type Room = {doc: Y.Doc; subscribers: Set<(update: Uint8Array) => void>; timer: ReturnType<typeof setTimeout> | null}

export type CanvasRelay = {
  snapshot: (sessionId: string) => Promise<Uint8Array>
  applyUpdate: (sessionId: string, update: Uint8Array) => Promise<void>
  subscribe: (sessionId: string, cb: (update: Uint8Array) => void) => Promise<() => void>
  flush: (sessionId: string) => Promise<void>
  dispose: () => Promise<void>
}

export function createCanvasRelay(opts: {store: CanvasStore; debounceMs?: number}): CanvasRelay {
  const debounceMs = opts.debounceMs ?? PERSIST_DEBOUNCE_MS
  const rooms = new Map<string, Room>()

  const persist = (sessionId: string, room: Room) => opts.store.save(sessionId, Y.encodeStateAsUpdate(room.doc))

  const schedulePersist = (sessionId: string, room: Room) => {
    if (room.timer) clearTimeout(room.timer)
    room.timer = setTimeout(() => {
      room.timer = null
      void persist(sessionId, room)
    }, debounceMs)
  }

  const getRoom = async (sessionId: string): Promise<Room> => {
    const existing = rooms.get(sessionId)
    if (existing) return existing
    const doc = new Y.Doc()
    const saved = await opts.store.load(sessionId)
    if (saved) Y.applyUpdate(doc, saved, REHYDRATE)
    const room: Room = {doc, subscribers: new Set(), timer: null}
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REHYDRATE) return
      for (const cb of room.subscribers) cb(update)
      schedulePersist(sessionId, room)
    })
    rooms.set(sessionId, room)
    return room
  }

  return {
    snapshot: async (sessionId) => Y.encodeStateAsUpdate((await getRoom(sessionId)).doc),
    applyUpdate: async (sessionId, update) => {
      const room = await getRoom(sessionId)
      Y.applyUpdate(room.doc, update, 'remote')
    },
    subscribe: async (sessionId, cb) => {
      const room = await getRoom(sessionId)
      room.subscribers.add(cb)
      return () => room.subscribers.delete(cb)
    },
    flush: async (sessionId) => {
      const room = rooms.get(sessionId)
      if (!room) return
      if (room.timer) {
        clearTimeout(room.timer)
        room.timer = null
      }
      await persist(sessionId, room)
    },
    dispose: async () => {
      for (const [sessionId, room] of rooms) {
        if (room.timer) clearTimeout(room.timer)
        await persist(sessionId, room)
        room.doc.destroy()
      }
      rooms.clear()
    },
  }
}
