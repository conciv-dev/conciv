import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, expectTypeOf, it} from 'vitest'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {openDb} from '../src/db.js'
import {makeSessionStore} from '../src/session-store.js'
import {sessions} from '../src/schema.js'

const record = (id: string) => ({
  id,
  harnessSessionId: null,
  harnessKind: 'claude',
  origin: 'chat' as const,
  title: null,
  model: null,
  usage: null,
  cwd: '/w',
})

describe('drizzle session store', () => {
  const make = () => makeSessionStore({db: openDb(mkdtempSync(join(tmpdir(), 'conciv-db-'))), now: () => 42})

  it('create then get round-trips', async () => {
    const store = make()
    await store.create(record('conciv_a'))
    const got = await store.get('conciv_a')
    expect(got?.id).toBe('conciv_a')
    expect(got?.createdAt).toBe(42)
  })

  it('update patches and bumps updatedAt', async () => {
    const store = make()
    await store.create(record('conciv_a'))
    const next = await store.update('conciv_a', {title: 'named'})
    expect(next.title).toBe('named')
  })

  it('list returns all, delete removes', async () => {
    const store = make()
    await store.create(record('conciv_a'))
    await store.create(record('conciv_b'))
    expect((await store.list()).length).toBe(2)
    await store.delete('conciv_a')
    expect((await store.list()).map((r) => r.id)).toEqual(['conciv_b'])
  })

  it('findByHarnessId matches', async () => {
    const store = make()
    await store.create({...record('conciv_a'), harnessSessionId: 'h-1'})
    expect((await store.findByHarnessId('h-1'))?.id).toBe('conciv_a')
  })

  it('watch fires on writes and unsubscribes', async () => {
    const store = make()
    let hits = 0
    const stop = store.watch(() => {
      hits += 1
    })
    await store.create(record('conciv_a'))
    await store.update('conciv_a', {title: 't'})
    stop()
    await store.delete('conciv_a')
    expect(hits).toBe(2)
  })

  it('two connections on one stateRoot interleave writes (WAL + busy timeout)', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-multi-'))
    const first = makeSessionStore({db: openDb(stateRoot), now: () => 1})
    const second = makeSessionStore({db: openDb(stateRoot), now: () => 2})
    await first.create(record('conciv_a'))
    await second.create(record('conciv_b'))
    await first.update('conciv_b', {title: 'from-first'})
    expect((await second.list()).map((r) => r.id).toSorted()).toEqual(['conciv_a', 'conciv_b'])
    expect((await second.get('conciv_b'))?.title).toBe('from-first')
  })

  it('drizzle row type matches SessionRecord (id brand applied by zod parse)', () => {
    expectTypeOf<Omit<typeof sessions.$inferSelect, 'id'>>().toEqualTypeOf<Omit<SessionRecord, 'id'>>()
    expectTypeOf<(typeof sessions.$inferSelect)['id']>().toEqualTypeOf<string>()
    expectTypeOf<SessionRecord['id']>().toExtend<string>()
  })
})
