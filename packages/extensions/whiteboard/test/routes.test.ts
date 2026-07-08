import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Hono} from 'hono'
import {serveApp, type ServedApp} from '@conciv/harness-testkit'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createStore, type Store} from '../src/server/db/store.js'
import {whiteboardApp, type WhiteboardEnv} from '../src/server/routes.js'
import {elementRowFixture} from './canvas-it-helpers.js'

let store: Store
let base = ''
let served: ServedApp

beforeAll(async () => {
  store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-routes-'))))
  const app = new Hono<WhiteboardEnv>()
    .use(async (c, next) => {
      c.set('whiteboard', {store})
      await next()
    })
    .route('/', whiteboardApp)
  served = await serveApp(app.fetch)
  base = served.base
})
afterAll(async () => {
  await served.close()
  store.close()
})

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {method: 'POST', body: JSON.stringify(body), headers: {'content-type': 'application/json'}})
const put = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {method: 'PUT', body: JSON.stringify(body), headers: {'content-type': 'application/json'}})

describe('whiteboard routes', () => {
  it('round-trips a pin through POST/GET/PUT/DELETE', async () => {
    const pin = {
      id: crypto.randomUUID(),
      room: 'r1',
      cid: 'c1',
      x: 1,
      y: 2,
      elementId: null,
      pinState: 'locked',
      anchorX: null,
      anchorY: null,
    }
    const created = await (await post('/pins', pin)).json()
    expect(created).toEqual(pin)
    const listed = await (await fetch(`${base}/pins?room=r1`)).json()
    expect(listed).toEqual([pin])
    const moved = await (await put(`/pins/${pin.id}`, {x: 9})).json()
    expect(moved.x).toBe(9)
    const deleted = await (await fetch(`${base}/pins/${pin.id}`, {method: 'DELETE'})).json()
    expect(deleted).toEqual({deleted: true})
  })

  it('scopes comments by sessionId via the room query param', async () => {
    const comment = {
      id: crypto.randomUUID(),
      sessionId: 'sess-a',
      cid: 'cc1',
      threadId: 'cc1',
      parentId: null,
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      authorModel: null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: 'floating',
      anchor: null,
      anchorFile: null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: 1000,
      updatedAt: 1000,
      resolvedAt: null,
    }
    expect((await post('/comments', comment)).status).toBe(200)
    expect(await (await fetch(`${base}/comments?room=sess-a`)).json()).toHaveLength(1)
    expect(await (await fetch(`${base}/comments?room=sess-b`)).json()).toHaveLength(0)
  })

  it('element upsert 409s on stale version with the winner top-level', async () => {
    const row = elementRowFixture({room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2})
    expect((await put('/elements/live', row)).status).toBe(200)
    const stale = await put('/elements/live', {...row, version: 1})
    expect(stale.status).toBe(409)
    expect((await stale.json()).current.version).toBe(2)
    expect(await (await fetch(`${base}/elements/live?room=r1`)).json()).toHaveLength(1)
  })

  it('bulk PUT echoes the authoritative row per input, winner on conflict', async () => {
    expect(
      (await put('/elements/live', elementRowFixture({room: 'rb', elementId: 'b1', data: {v: 1}, version: 5}))).status,
    ).toBe(200)
    const response = await put('/elements/live/bulk', {
      rows: [
        elementRowFixture({room: 'rb', elementId: 'b1', data: {v: 2}, version: 3}),
        elementRowFixture({room: 'rb', elementId: 'b2', data: {v: 9}, version: 1}),
      ],
    })
    expect(response.status).toBe(200)
    const {rows} = (await response.json()) as {rows: unknown[]}
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(elementRowFixture({room: 'rb', elementId: 'b1', data: {v: 1}, version: 5}))
    expect(rows[1]).toEqual(elementRowFixture({room: 'rb', elementId: 'b2', data: {v: 9}, version: 1}))
  })

  it('rejects an invalid body with 400', async () => {
    expect((await put('/elements/live', {room: 'r1'})).status).toBe(400)
    expect((await post('/pins', {id: 'x'})).status).toBe(400)
  })

  it('streams table-named SSE events for writes in the room only', async () => {
    const controller = new AbortController()
    const stream = await fetch(`${base}/changes?room=sse-room`, {signal: controller.signal})
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('no body')
    await store.insertPin({id: crypto.randomUUID(), room: 'other-room', cid: 'cx', x: 0, y: 0})
    await store.insertPin({id: crypto.randomUUID(), room: 'sse-room', cid: 'c2', x: 5, y: 6})
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('event: pins')) {
      const {value, done} = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    controller.abort()
    expect(text).toContain('event: pins')
    expect(text).toContain('"cid":"c2"')
    expect(text).not.toContain('"cid":"cx"')
  })

  it('streams cursor events', async () => {
    const controller = new AbortController()
    const stream = await fetch(`${base}/changes?room=cur-room`, {signal: controller.signal})
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('no body')
    await post('/cursor', {
      room: 'cur-room',
      peerId: 'p1',
      kind: 'human',
      x: 0,
      y: 0,
      name: 'G',
      color: '#fff',
      lastSeen: 1,
    })
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('event: cursor')) {
      const {value, done} = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    controller.abort()
    expect(text).toContain('"peerId":"p1"')
  })
})
