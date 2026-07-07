import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {eq} from 'drizzle-orm'
import {afterEach, describe, expect, it} from 'vitest'
import {createStore, type Store, type WhiteboardEvent} from '../src/server/db/store.js'
import {comments} from '../src/server/db/schema.js'

const stores: Store[] = []
const open = async (): Promise<Store> => {
  const store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-store-'))))
  stores.push(store)
  return store
}
afterEach(() => stores.splice(0).forEach((store) => store.close()))

describe('whiteboard store', () => {
  it('inserts, updates, deletes comments and emits typed events', async () => {
    const store = await open()
    const events: WhiteboardEvent[] = []
    store.onEvent((event) => events.push(event))
    const saved = await store.insertComment({
      id: crypto.randomUUID(),
      sessionId: 's1',
      cid: 'c1',
      threadId: 'c1',
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      kind: 'floating',
      createdAt: 1000,
      updatedAt: 1000,
    })
    expect(saved.status).toBe('open')
    expect(saved.parentId).toBeNull()
    const listed = await store.db.select().from(comments).where(eq(comments.sessionId, 's1'))
    expect(listed).toHaveLength(1)
    const updated = await store.updateComment(saved.id, {status: 'resolved', resolvedAt: 2000})
    expect(updated?.status).toBe('resolved')
    expect(await store.deleteComment(saved.id)).toBe(true)
    expect(events.map((event) => event.table)).toEqual(['comments', 'comments', 'comments'])
    expect(events.map((event) => (event.table === 'cursor' ? 'cursor' : event.type))).toEqual([
      'upsert',
      'upsert',
      'delete',
    ])
  })

  it('gates element upserts by version', async () => {
    const store = await open()
    const base = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    expect((await store.upsertElement('live', base)).ok).toBe(true)
    const stale = await store.upsertElement('live', {...base, version: 1, data: {type: 'ellipse'}})
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.current.version).toBe(2)
    expect((await store.upsertElement('live', {...base, version: 3})).ok).toBe(true)
    expect(await store.listElements('live', 'r1')).toEqual([{...base, version: 3}])
  })

  it('bulk upsert and bulk delete cover the pending drain', async () => {
    const store = await open()
    const rows = [
      {room: 'r1', elementId: 'e1', data: {}, version: 1},
      {room: 'r1', elementId: 'e2', data: {}, version: 1},
    ]
    expect(await store.upsertElements('draft', rows)).toHaveLength(2)
    expect(await store.deleteElements('draft', 'r1', ['e1', 'e2'])).toBe(2)
    expect(await store.listElements('draft', 'r1')).toHaveLength(0)
  })

  it('broadcasts cursor events without persisting', async () => {
    const store = await open()
    const events: WhiteboardEvent[] = []
    store.onEvent((event) => events.push(event))
    store.cursor({room: 'r1', peerId: 'p1', kind: 'human', x: 1, y: 2, name: 'G', color: '#fff', lastSeen: 1000})
    expect(events).toHaveLength(1)
    expect(events[0]?.table).toBe('cursor')
  })

  it('persists across reopen from the same dataDir', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wb-persist-')))
    const first = await createStore(dir)
    await first.upsertElement('live', {room: 'r1', elementId: 'e1', data: {}, version: 1})
    first.close()
    const second = await createStore(dir)
    stores.push(second)
    expect(await second.listElements('live', 'r1')).toHaveLength(1)
  })
})
