import * as Y from 'yjs'
import {Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates} from 'y-protocols/awareness'
import {readSyncMessage, writeSyncStep1, writeUpdate} from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import {defineWebSocketHandler, getRouterParam, type EventHandler} from 'h3'
import type {Hooks, Peer} from 'crossws'
import {ORIGIN, type SnapshotStore, type SyncEngine} from '../../shared/sync-types.js'

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

export type SyncOptions = {store: SnapshotStore}
export type Sync = {engine: SyncEngine; handler: EventHandler}

type AwarenessChange = {added: number[]; updated: number[]; removed: number[]}
type RoomState = {doc: Y.Doc; awareness: Awareness; peers: Set<Peer>; controlled: Map<Peer, Set<number>>}

function frame(type: number, write: (encoder: encoding.Encoder) => void): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, type)
  write(encoder)
  return encoding.toUint8Array(encoder)
}

function peerOf(origin: unknown, peers: Set<Peer>): Peer | null {
  for (const peer of peers) if (peer === origin) return peer
  return null
}

function trackControlled(state: RoomState, peer: Peer, added: number[], removed: number[]): void {
  const set = state.controlled.get(peer) ?? new Set<number>()
  for (const id of added) set.add(id)
  for (const id of removed) set.delete(id)
  state.controlled.set(peer, set)
}

export function createSync(opts: SyncOptions): Sync {
  const rooms = new Map<string, RoomState>()

  const ensureRoom = (roomId: string): RoomState => {
    const existing = rooms.get(roomId)
    if (existing) return existing
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    const state: RoomState = {doc, awareness, peers: new Set(), controlled: new Map()}
    rooms.set(roomId, state)
    void opts.store
      .load(roomId)
      .then((saved) => saved && Y.applyUpdate(doc, saved, ORIGIN.REHYDRATE))
      .catch(() => {})
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      const message = frame(MESSAGE_SYNC, (encoder) => writeUpdate(encoder, update))
      for (const peer of state.peers) if (peer !== origin) peer.send(message)
    })
    awareness.on('update', ({added, updated, removed}: AwarenessChange, origin: unknown) => {
      const source = peerOf(origin, state.peers)
      if (source) trackControlled(state, source, added, removed)
      const message = frame(MESSAGE_AWARENESS, (encoder) =>
        encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])),
      )
      for (const peer of state.peers) peer.send(message)
    })
    return state
  }

  const roomHooks = (roomId: string): Partial<Hooks> => ({
    open: (peer) => {
      const state = ensureRoom(roomId)
      state.peers.add(peer)
      state.controlled.set(peer, new Set())
      peer.send(frame(MESSAGE_SYNC, (encoder) => writeSyncStep1(encoder, state.doc)))
      const clients = [...state.awareness.getStates().keys()]
      if (clients.length)
        peer.send(
          frame(MESSAGE_AWARENESS, (e) =>
            encoding.writeVarUint8Array(e, encodeAwarenessUpdate(state.awareness, clients)),
          ),
        )
    },
    message: (peer, message) => {
      const state = rooms.get(roomId)
      if (!state) return
      const decoder = decoding.createDecoder(message.uint8Array())
      const type = decoding.readVarUint(decoder)
      if (type === MESSAGE_SYNC) {
        const reply = frame(MESSAGE_SYNC, (encoder) => readSyncMessage(decoder, encoder, state.doc, peer))
        if (reply.length > 1) peer.send(reply)
        return
      }
      if (type === MESSAGE_AWARENESS) applyAwarenessUpdate(state.awareness, decoding.readVarUint8Array(decoder), peer)
    },
    close: (peer) => {
      const state = rooms.get(roomId)
      if (!state) return
      removeAwarenessStates(state.awareness, [...(state.controlled.get(peer) ?? [])], null)
      state.controlled.delete(peer)
      state.peers.delete(peer)
      if (state.peers.size === 0) void opts.store.save(roomId, Y.encodeStateAsUpdate(state.doc)).catch(() => {})
    },
  })

  const handler = defineWebSocketHandler((event) => roomHooks(decodeURIComponent(getRouterParam(event, 'room') ?? '')))

  const engine: SyncEngine = {
    room: (roomId) => {
      const state = ensureRoom(roomId)
      return {
        doc: state.doc,
        awareness: state.awareness,
        observe: (cb) => {
          const observer = (update: Uint8Array, origin: unknown): void => cb(update, origin)
          state.doc.on('update', observer)
          return () => state.doc.off('update', observer)
        },
        apply: (update, origin) => Y.applyUpdate(state.doc, update, origin),
        snapshot: () => Y.encodeStateAsUpdate(state.doc),
      }
    },
  }

  return {engine, handler}
}
