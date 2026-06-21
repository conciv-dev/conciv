import {getValidatedRouterParams, readValidatedBody, type H3, type H3Event} from 'h3'
import {z} from 'zod'
import type {SyncEngine} from '@mandarax/protocol/sync-types'
import {sseStream} from '../api/sse.js'

export type ValidateRoom = (room: string, event: H3Event) => boolean

const RoomParams = z.object({room: z.string()})
const PostBody = z.object({u: z.string(), c: z.string()})

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

export function registerSyncRelay(app: H3, engine: SyncEngine, validateRoom: ValidateRoom): void {
  app.get('/api/sync/:room', async (event) => {
    const {room: roomId} = await getValidatedRouterParams(event, RoomParams)
    if (!validateRoom(roomId, event)) return new Response('forbidden', {status: 403})
    const clientId = new URL(event.req.url).searchParams.get('c') ?? ''
    const room = engine.room(roomId)
    return sseStream(event, 'sync open', (emit) => {
      emit({u: toBase64(room.snapshot())})
      return room.observe((update, origin) => {
        if (String(origin) === clientId) return
        emit({u: toBase64(update), o: String(origin)})
      })
    })
  })
  app.post('/api/sync/:room', async (event) => {
    const {room: roomId} = await getValidatedRouterParams(event, RoomParams)
    if (!validateRoom(roomId, event)) return new Response('forbidden', {status: 403})
    const {u, c} = await readValidatedBody(event, PostBody)
    engine.room(roomId).apply(fromBase64(u), c)
    return {ok: true}
  })
}
