import type {Doc} from 'yjs'

export const ORIGIN = {
  USER: 'user',
  AI: 'ai',
  REMOTE: 'remote',
  REHYDRATE: 'core-rehydrate',
  EXCALIDRAW: 'excalidraw',
} as const

export type Origin = (typeof ORIGIN)[keyof typeof ORIGIN]

export type SyncRoom = {
  doc: Doc
  observe: (cb: (update: Uint8Array, origin: unknown) => void) => () => void
  apply: (update: Uint8Array, origin: unknown) => void
  snapshot: () => Uint8Array
}

export type SyncEngine = {room: (roomId: string) => SyncRoom}

export type SnapshotStore = {
  load: (room: string) => Promise<Uint8Array | null>
  save: (room: string, ybin: Uint8Array) => Promise<void>
}

export type ClientRoom = {doc: Doc; connected: () => boolean; disconnect: () => void}

export type ClientSync = {room: (roomId: string) => ClientRoom}
