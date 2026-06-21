import * as Y from 'yjs'
import {IndexeddbPersistence} from 'y-indexeddb'
import {z} from 'zod'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'
import {ORIGIN, type ClientRoom, type ClientSync} from '@mandarax/protocol/sync-types'

export type ClientSyncOptions = {persist?: boolean}

const Frame = z.object({u: z.string(), o: z.string().optional()})

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function parseFrames(buffer: string): {frames: z.infer<typeof Frame>[]; rest: string} {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  const frames = parts
    .filter((part) => part.startsWith('data: '))
    .map((part) => Frame.safeParse(JSON.parse(part.slice(6))))
    .filter((result) => result.success)
    .map((result) => result.data)
  return {frames, rest}
}

function createRoom(coreBaseUrl: string, token: string, roomId: string, persist: boolean): ClientRoom {
  const doc = new Y.Doc()
  const clientId = crypto.randomUUID()
  const aborter = new AbortController()
  const state = {open: false}
  const persistence = persist ? new IndexeddbPersistence(roomId, doc) : null

  const headers = {[MANDARAX_SESSION_HEADER]: token}
  doc.on('update', (update, origin) => {
    if (origin === ORIGIN.REMOTE) return
    void fetch(`${coreBaseUrl}/api/sync/${roomId}`, {
      method: 'POST',
      headers: {...headers, 'content-type': 'application/json'},
      body: JSON.stringify({u: toBase64(update), c: clientId}),
    }).catch(() => {})
  })

  const listen = async (): Promise<void> => {
    const res = await fetch(`${coreBaseUrl}/api/sync/${roomId}?c=${clientId}`, {headers, signal: aborter.signal})
    if (!res.body) return
    state.open = true
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const {value, done} = await reader.read()
      if (done) break
      buffer += decoder.decode(value)
      const {frames, rest} = parseFrames(buffer)
      buffer = rest
      for (const frame of frames) Y.applyUpdate(doc, fromBase64(frame.u), ORIGIN.REMOTE)
    }
    state.open = false
  }
  listen().catch(() => {
    state.open = false
  })

  return {
    doc,
    connected: () => state.open,
    disconnect: () => {
      aborter.abort()
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
