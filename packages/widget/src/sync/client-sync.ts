import * as Y from 'yjs'
import {WebsocketProvider} from 'y-websocket'
import {IndexeddbPersistence} from 'y-indexeddb'
import type {ClientRoom, ClientSync} from '@mandarax/protocol/sync-types'

export type ClientSyncOptions = {persist?: boolean}

function wsBase(coreBaseUrl: string): string {
  const url = new URL(coreBaseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${url.origin}/api/sync`
}

function createRoom(coreBaseUrl: string, token: string, roomId: string, persist: boolean): ClientRoom {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(wsBase(coreBaseUrl), roomId, doc, {
    connect: true,
    params: token ? {token} : {},
  })
  const persistence = persist ? new IndexeddbPersistence(roomId, doc) : null
  return {
    doc,
    awareness: provider.awareness,
    connected: () => provider.wsconnected,
    disconnect: () => {
      provider.destroy()
      persistence?.destroy()
      doc.destroy()
    },
  }
}

export function createClientSync(coreBaseUrl: string, token: string, opts: ClientSyncOptions = {}): ClientSync {
  const persist = opts.persist ?? true
  const rooms = new Map<string, ClientRoom>()
  return {
    room: (roomId) => {
      const existing = rooms.get(roomId)
      if (existing) return existing
      const room = createRoom(coreBaseUrl, token, roomId, persist)
      rooms.set(roomId, room)
      return room
    },
  }
}
