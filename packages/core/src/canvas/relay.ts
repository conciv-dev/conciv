import * as Y from 'yjs'
import type {CanvasStore} from './canvas-store.js'

// Core holds the authoritative Y.Doc per session (multi-master CRDT — the .ybin is the durable
// snapshot, not "the authority"). Clients sync opaque updates through this relay: applyUpdate merges
// + broadcasts to every subscriber (Yjs applyUpdate is idempotent, so echoing to the sender is a
// harmless no-op), and edits are persisted to the store debounced. Rehydrate uses its own origin so a
// boot load never rebroadcasts.
const REHYDRATE = Symbol('relay.rehydrate')
const CORE = Symbol('relay.core')
const PERSIST_DEBOUNCE_MS = 400

// An Excalidraw element as the canvas stores it — id-keyed, version-tracked, otherwise opaque.
export type CanvasElement = {id: string; version: number} & Record<string, unknown>

// A comment pin: pure geometry keyed by commentId (the source of truth for "a comment exists" is the
// TrailBase/sqlite row; the pin is the Yjs half of the join). pinState is a geometric fact.
export type CanvasPin = {
  commentId: string
  x: number
  y: number
  elementId?: string
  pinState: 'locked' | 'offset'
}

type Room = {doc: Y.Doc; subscribers: Set<(update: Uint8Array) => void>; timer: ReturnType<typeof setTimeout> | null}

export type CanvasRelay = {
  snapshot: (sessionId: string) => Promise<Uint8Array>
  applyUpdate: (sessionId: string, update: Uint8Array) => Promise<void>
  subscribe: (sessionId: string, cb: (update: Uint8Array) => void) => Promise<() => void>
  // Server-side element ops the AI's canvas tools use — mutate the authoritative doc directly.
  read: (sessionId: string) => Promise<CanvasElement[]>
  draw: (sessionId: string, elements: CanvasElement[]) => Promise<void>
  // Pin geometry (the Yjs half of the commentId join). setPin/deletePin run inside the comment execute.
  setPin: (sessionId: string, pin: CanvasPin) => Promise<void>
  deletePin: (sessionId: string, commentId: string) => Promise<void>
  pins: (sessionId: string) => Promise<CanvasPin[]>
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
    read: async (sessionId) => {
      const room = await getRoom(sessionId)
      return [...room.doc.getMap<CanvasElement>('elements').values()]
    },
    draw: async (sessionId, elements) => {
      const room = await getRoom(sessionId)
      room.doc.transact(() => {
        const map = room.doc.getMap<CanvasElement>('elements')
        for (const el of elements) map.set(el.id, el)
      }, CORE)
    },
    setPin: async (sessionId, pin) => {
      const room = await getRoom(sessionId)
      room.doc.transact(() => room.doc.getMap<CanvasPin>('pins').set(pin.commentId, pin), CORE)
    },
    deletePin: async (sessionId, commentId) => {
      const room = await getRoom(sessionId)
      room.doc.transact(() => room.doc.getMap<CanvasPin>('pins').delete(commentId), CORE)
    },
    pins: async (sessionId) => {
      const room = await getRoom(sessionId)
      return [...room.doc.getMap<CanvasPin>('pins').values()]
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
