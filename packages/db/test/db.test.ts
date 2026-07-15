import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {eq} from 'drizzle-orm'
import {describe, expect, it, expectTypeOf} from 'vitest'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {openDb} from '../src/db.js'
import {claimRun, runMessagesFor, replyFor, setRunMessages, statusOf, writeReply} from '../src/run-queries.js'
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
  createdAt: 1,
  updatedAt: 1,
})

describe('openDb', () => {
  it('sessions round-trip through the typed orm', () => {
    const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-db-')))
    db.insert(sessions).values(record('conciv_a')).run()
    const rows = db.select().from(sessions).where(eq(sessions.id, 'conciv_a')).all()
    expect(rows[0]?.cwd).toBe('/w')
    db.update(sessions).set({title: 'named', updatedAt: 2}).where(eq(sessions.id, 'conciv_a')).run()
    expect(db.select().from(sessions).all()[0]?.title).toBe('named')
  })

  it('boot sweep resets stuck runs, preserves messages, and clears replies', () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-sweep-'))
    const first = openDb(stateRoot)
    first
      .insert(sessions)
      .values({...record('conciv_z'), title: 'keep'})
      .run()
    claimRun(first, 'conciv_z', 'chat')
    setRunMessages(first, 'conciv_z', [{id: 'm1'}])
    writeReply(first, 'conciv_z', 'k', true)
    const second = openDb(stateRoot)
    expect(second.select().from(sessions).all()[0]?.title).toBe('keep')
    expect(statusOf(second, 'conciv_z')).toBe('idle')
    expect(runMessagesFor(second, 'conciv_z')?.messages).toEqual([{id: 'm1'}])
    expect(replyFor(second, 'conciv_z', 'k')).toBeNull()
  })

  it('two connections on one stateRoot interleave writes (WAL + busy timeout)', () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-multi-'))
    const first = openDb(stateRoot)
    const second = openDb(stateRoot)
    first.insert(sessions).values(record('conciv_a')).run()
    second.insert(sessions).values(record('conciv_b')).run()
    first.update(sessions).set({title: 'from-first'}).where(eq(sessions.id, 'conciv_b')).run()
    const ids = second
      .select({id: sessions.id})
      .from(sessions)
      .all()
      .map((row) => row.id)
      .toSorted()
    expect(ids).toEqual(['conciv_a', 'conciv_b'])
    expect(second.select().from(sessions).where(eq(sessions.id, 'conciv_b')).all()[0]?.title).toBe('from-first')
  })

  it('drizzle row type matches SessionRecord (id brand applied by zod parse)', () => {
    expectTypeOf<Omit<typeof sessions.$inferSelect, 'id'>>().toEqualTypeOf<Omit<SessionRecord, 'id'>>()
    expectTypeOf<(typeof sessions.$inferSelect)['id']>().toEqualTypeOf<string>()
    expectTypeOf<SessionRecord['id']>().toExtend<string>()
  })
})
