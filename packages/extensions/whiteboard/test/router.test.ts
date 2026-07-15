import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {RPCHandler} from '@orpc/server/fetch'
import {safe} from '@orpc/client'
import {makeExtRpcClient} from '@conciv/extension'
import {serveApp, type ServedApp} from '@conciv/harness-testkit'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createStore, type Store} from '../src/server/db/store.js'
import {makeWhiteboardRouter, type WhiteboardRouter} from '../src/server/router.js'
import {elementRowFixture} from './canvas-it-helpers.js'

let store: Store
let served: ServedApp
let client: ReturnType<typeof makeExtRpcClient<WhiteboardRouter>>

beforeAll(async () => {
  store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-router-'))))
  const handler = new RPCHandler(makeWhiteboardRouter(store))
  served = await serveApp(async (request: Request) => {
    const {response} = await handler.handle(request, {prefix: '/rpc/ext/whiteboard', context: {request}})
    return response ?? new Response('not found', {status: 404})
  })
  client = makeExtRpcClient<WhiteboardRouter>(served.base, 'whiteboard')
})
afterAll(async () => {
  await served.close()
  store.close()
})

describe('whiteboard router', () => {
  it('round-trips a pin through insert/list/update/remove', async () => {
    const pin = {
      id: crypto.randomUUID(),
      room: 'r1',
      cid: 'c1',
      x: 1,
      y: 2,
      elementId: null,
      pinState: 'locked' as const,
      anchorX: null,
      anchorY: null,
    }
    expect(await client.pins.insert(pin)).toEqual(pin)
    expect(await client.pins.list({room: 'r1'})).toEqual([pin])
    const moved = await client.pins.update({id: pin.id, patch: {x: 9}})
    expect(moved.x).toBe(9)
    expect(await client.pins.remove({id: pin.id})).toEqual({deleted: true})
  })

  it('scopes comments by sessionId via the room input', async () => {
    const comment = {
      id: crypto.randomUUID(),
      sessionId: 'sess-a',
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
    await client.comments.insert(comment)
    expect(await client.comments.list({room: 'sess-a'})).toHaveLength(1)
    expect(await client.comments.list({room: 'sess-b'})).toHaveLength(0)
  })

  it('element upsert reports a typed CONFLICT carrying the winner on stale version', async () => {
    const row = elementRowFixture({room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2})
    expect(await client.elements.upsert({scope: 'live', row})).toEqual(row)
    const {error, isDefined} = await safe(client.elements.upsert({scope: 'live', row: {...row, version: 1}}))
    if (!isDefined || error.code !== 'CONFLICT') throw new Error('expected a typed CONFLICT')
    expect(error.data.current.version).toBe(2)
    expect(await client.elements.list({scope: 'live', room: 'r1'})).toHaveLength(1)
  })

  it('bulk upsert echoes the authoritative row per input, winner on conflict', async () => {
    await client.elements.upsert({
      scope: 'live',
      row: elementRowFixture({room: 'rb', elementId: 'b1', data: {v: 1}, version: 5}),
    })
    const {rows} = await client.elements.bulkUpsert({
      scope: 'live',
      rows: [
        elementRowFixture({room: 'rb', elementId: 'b1', data: {v: 2}, version: 3}),
        elementRowFixture({room: 'rb', elementId: 'b2', data: {v: 9}, version: 1}),
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(elementRowFixture({room: 'rb', elementId: 'b1', data: {v: 1}, version: 5}))
    expect(rows[1]).toEqual(elementRowFixture({room: 'rb', elementId: 'b2', data: {v: 9}, version: 1}))
  })

  it('rejects an invalid input at the wire', async () => {
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${served.base}/rpc/ext/whiteboard/${path}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({json: body}),
      })
    expect((await post('elements/upsert', {scope: 'live', row: {room: 'r1'}})).ok).toBe(false)
    expect((await post('pins/insert', {id: 'x'})).ok).toBe(false)
  })

  it('streams typed change events for writes in the room only', async () => {
    const abort = new AbortController()
    const changes = await client.changes({room: 'sse-room'}, {signal: abort.signal})
    await new Promise((resolve) => setTimeout(resolve, 50))
    await store.insertPin({id: crypto.randomUUID(), room: 'other-room', cid: 'cx', x: 0, y: 0})
    await store.insertPin({id: crypto.randomUUID(), room: 'sse-room', cid: 'c2', x: 5, y: 6})
    const first = await changes.next()
    abort.abort()
    if (first.done) throw new Error('changes ended before an event arrived')
    expect(first.value.table).toBe('pins')
    expect(JSON.stringify(first.value)).toContain('"cid":"c2"')
    await changes.return(undefined).catch(() => {})
  })

  it('streams cursor events', async () => {
    const abort = new AbortController()
    const changes = await client.changes({room: 'cur-room'}, {signal: abort.signal})
    await new Promise((resolve) => setTimeout(resolve, 50))
    await client.cursor({
      room: 'cur-room',
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
