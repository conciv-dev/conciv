import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createORPCClient, safe} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {RouterClient} from '@orpc/server'
import {serveExtensionRpc, type ServedRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'
import {CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createStore, type Store} from '../src/server/db/store.js'
import {makeWhiteboardRouter, type WhiteboardRouter} from '../src/server/router.js'

const ROOM_R1 = SessionId.parse('conciv_r1')
const ROOM_SESS_A = SessionId.parse('conciv_sess_a')
const ROOM_SESS_B = SessionId.parse('conciv_sess_b')
const ROOM_SSE = SessionId.parse('conciv_sse_room')
const ROOM_OTHER = SessionId.parse('conciv_other_room')
const ROOM_WS = SessionId.parse('conciv_ws_room')
const ROOM_WS_STREAM = SessionId.parse('conciv_ws_stream')
const ROOM_CUR = SessionId.parse('conciv_cur_room')
const ROOM_BULK = SessionId.parse('conciv_bulk_room')
const ROOM_VICTIM = SessionId.parse('conciv_victim_room')
const ROOM_ATTACKER = SessionId.parse('conciv_attacker_room')

type Client = RouterClient<WhiteboardRouter>

let store: Store
let served: ServedRpcRouter
let client: Client
let attacker: Client

const clientFor = (room: SessionId | null): Client =>
  createORPCClient(
    new RPCLink({
      url: served.rpcUrl,
      headers: () => (room === null ? {} : {[CONCIV_SESSION_HEADER]: room}),
    }),
  )

const pinIn = (room: SessionId, cid: string) => ({
  id: crypto.randomUUID(),
  room,
  cid,
  x: 1,
  y: 2,
  elementId: null,
  pinState: 'locked' as const,
  anchorX: null,
  anchorY: null,
})

const withoutRoom = <T extends {room: unknown}>({room, ...rest}: T): Omit<T, 'room'> => {
  void room
  return rest
}

const withoutSessionId = <T extends {sessionId: unknown}>({sessionId, ...rest}: T): Omit<T, 'sessionId'> => {
  void sessionId
  return rest
}

beforeAll(async () => {
  store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-router-'))))
  served = await serveExtensionRpc({slug: 'whiteboard', router: makeWhiteboardRouter(store)})
  client = clientFor(ROOM_R1)
  attacker = clientFor(ROOM_ATTACKER)
})
afterAll(async () => {
  await served.close()
  store.close()
})

describe('whiteboard router', () => {
  it('round-trips a pin through insert/list/update/remove', async () => {
    const pin = pinIn(ROOM_R1, 'c1')
    expect(await client.pins.insert(withoutRoom(pin))).toEqual(pin)
    expect(await client.pins.list()).toEqual([pin])
    const moved = await client.pins.update({id: pin.id, patch: {x: 9}})
    expect(moved.x).toBe(9)
    expect(await client.pins.remove({id: pin.id})).toEqual({deleted: true})
  })

  it('scopes comments by the session the caller carries', async () => {
    const comment = {
      id: crypto.randomUUID(),
      sessionId: ROOM_SESS_A,
      cid: 'cc1',
      threadId: 'cc1',
      parentId: null,
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human' as const,
      authorModel: null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open' as const,
      kind: 'floating' as const,
      anchor: null,
      anchorFile: null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: 1000,
      updatedAt: 1000,
      resolvedAt: null,
    }
    await clientFor(ROOM_SESS_A).comments.insert(withoutSessionId(comment))
    expect(await clientFor(ROOM_SESS_A).comments.list()).toHaveLength(1)
    expect(await clientFor(ROOM_SESS_B).comments.list()).toHaveLength(0)
  })

  it('element upsert reports a typed CONFLICT carrying the winner on stale version', async () => {
    const rowIn = {elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    expect(await client.elements.upsert({scope: 'live', row: rowIn})).toEqual({...rowIn, room: ROOM_R1})
    const {error, isDefined} = await safe(client.elements.upsert({scope: 'live', row: {...rowIn, version: 1}}))
    if (!isDefined || error.code !== 'CONFLICT') throw new Error('expected a typed CONFLICT')
    expect(error.data.current.version).toBe(2)
    expect(await client.elements.list({scope: 'live'})).toHaveLength(1)
  })

  it('bulk upsert echoes the authoritative row per input, winner on conflict', async () => {
    const bulk = clientFor(ROOM_BULK)
    await bulk.elements.upsert({scope: 'live', row: {elementId: 'b1', data: {v: 1}, version: 5}})
    const {rows} = await bulk.elements.bulkUpsert({
      scope: 'live',
      rows: [
        {elementId: 'b1', data: {v: 2}, version: 3},
        {elementId: 'b2', data: {v: 9}, version: 1},
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({room: ROOM_BULK, elementId: 'b1', data: {v: 1}, version: 5})
    expect(rows[1]).toEqual({room: ROOM_BULK, elementId: 'b2', data: {v: 9}, version: 1})
  })

  it('rejects an invalid input at the wire', async () => {
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${served.base}/rpc/ext/whiteboard/${path}`, {
        method: 'POST',
        headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: ROOM_R1},
        body: JSON.stringify({json: body}),
      })
    expect((await post('elements/upsert', {scope: 'live', row: {elementId: 'e1'}})).ok).toBe(false)
    expect((await post('pins/insert', {id: 'x'})).ok).toBe(false)
  })

  it('refuses a room-scoped call that carries no session header', async () => {
    const anonymous = clientFor(null)
    const {error, isDefined} = await safe(anonymous.pins.list())
    expect(isDefined).toBe(false)
    expect(error).toBeInstanceOf(Error)
  })

  it('never lets another session update a row it does not own', async () => {
    const pin = pinIn(ROOM_VICTIM, 'victim-pin')
    const victim = clientFor(ROOM_VICTIM)
    await victim.pins.insert(withoutRoom(pin))
    const {error} = await safe(attacker.pins.update({id: pin.id, patch: {x: 999}}))
    expect(error).toBeInstanceOf(Error)
    expect(await victim.pins.list()).toEqual([pin])
    expect(await attacker.pins.list()).toEqual([])
  })

  it('an insert always lands in the caller own room, even if the caller tries to smuggle in a foreign one', async () => {
    const post = (body: unknown): Promise<Response> =>
      fetch(`${served.base}/rpc/ext/whiteboard/pins/insert`, {
        method: 'POST',
        headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: ROOM_ATTACKER},
        body: JSON.stringify({json: body}),
      })
    const smuggled = {...pinIn(ROOM_VICTIM, 'planted-pin'), room: ROOM_VICTIM}
    const response = await post(smuggled)
    expect(response.ok).toBe(true)
    expect((await clientFor(ROOM_VICTIM).pins.list()).map((row) => row.cid)).not.toContain('planted-pin')
    expect((await attacker.pins.list()).map((row) => row.cid)).toContain('planted-pin')
  })

  it('an element upsert from another session never lands in the target room', async () => {
    const victim = clientFor(ROOM_VICTIM)
    const mine = {elementId: 'shared', data: {v: 'mine'}, version: 1}
    await victim.elements.upsert({scope: 'live', row: mine})
    await attacker.elements.upsert({scope: 'live', row: {elementId: 'shared', data: {v: 'theirs'}, version: 9}})
    await attacker.elements.bulkUpsert({
      scope: 'live',
      rows: [{elementId: 'planted', data: {v: 'theirs'}, version: 1}],
    })
    expect(await victim.elements.list({scope: 'live'})).toEqual([{...mine, room: ROOM_VICTIM}])
    expect((await attacker.elements.list({scope: 'live'})).map((row) => row.elementId).toSorted()).toEqual([
      'planted',
      'shared',
    ])
  })

  it('streams typed change events for writes in the room only', async () => {
    const abort = new AbortController()
    const sse = clientFor(ROOM_SSE)
    const changes = await sse.changes(undefined, {signal: abort.signal})
    await new Promise((resolve) => setTimeout(resolve, 50))
    await store.insertPin({id: crypto.randomUUID(), room: ROOM_OTHER, cid: 'cx', x: 0, y: 0})
    await store.insertPin({id: crypto.randomUUID(), room: ROOM_SSE, cid: 'c2', x: 5, y: 6})
    const first = await changes.next()
    abort.abort()
    if (first.done) throw new Error('changes ended before an event arrived')
    expect(first.value.table).toBe('pins')
    expect(JSON.stringify(first.value)).toContain('"cid":"c2"')
    await changes.return(undefined).catch(() => {})
  })

  it('answers the same procedures over the websocket mount under ext.whiteboard', async () => {
    const socket = new WebSocket(served.wsUrl)
    const wsClient = rpcOverWebsocket<RouterClient<WhiteboardRouter>>(socket, {
      path: ['ext', 'whiteboard'],
      session: ROOM_WS,
    })
    const pin = pinIn(ROOM_WS, 'cws')
    expect(await wsClient.pins.insert(withoutRoom(pin))).toEqual(pin)
    expect(await clientFor(ROOM_WS).pins.list()).toEqual([pin])
    socket.close()
  })

  it('streams typed change events over the websocket mount', async () => {
    const socket = new WebSocket(served.wsUrl)
    const wsClient = rpcOverWebsocket<RouterClient<WhiteboardRouter>>(socket, {
      path: ['ext', 'whiteboard'],
      session: ROOM_WS_STREAM,
    })
    const abort = new AbortController()
    const changes = await wsClient.changes(undefined, {signal: abort.signal})
    await new Promise((resolve) => setTimeout(resolve, 50))
    await store.insertPin({id: crypto.randomUUID(), room: ROOM_WS_STREAM, cid: 'cws2', x: 1, y: 1})
    const first = await changes.next()
    abort.abort()
    if (first.done) throw new Error('changes ended before an event arrived')
    expect(first.value.table).toBe('pins')
    expect(JSON.stringify(first.value)).toContain('"cid":"cws2"')
    await changes.return(undefined).catch(() => {})
    socket.close()
  })

  it('streams cursor events', async () => {
    const abort = new AbortController()
    const cursorClient = clientFor(ROOM_CUR)
    const changes = await cursorClient.changes(undefined, {signal: abort.signal})
    await new Promise((resolve) => setTimeout(resolve, 50))
    await cursorClient.cursor({
      peerId: 'p1',
      kind: 'human',
      x: 0,
      y: 0,
      name: 'G',
      color: '#fff',
      lastSeen: 1,
    })
    const first = await changes.next()
    abort.abort()
    if (first.done) throw new Error('changes ended before an event arrived')
    expect(first.value.table).toBe('cursor')
    expect(JSON.stringify(first.value)).toContain('"peerId":"p1"')
    await changes.return(undefined).catch(() => {})
  })
})
