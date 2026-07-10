import {describe, it, expect} from 'vitest'
import {buildSessionList, createSession, sessionByHarnessId, sweepEmptyChatRecords} from '../../src/chat/session.js'
import {sessions} from '@conciv/db'
import {testDb} from '../helpers/memory-store.js'

const rec = (over: {
  id: string
  cwd?: string
  harnessSessionId?: string | null
  title?: string | null
  origin?: 'chat' | 'agent' | 'external'
}) => ({
  id: over.id,
  harnessSessionId: over.harnessSessionId ?? null,
  harnessKind: 'claude',
  origin: over.origin ?? ('chat' as const),
  title: over.title ?? null,
  model: null,
  usage: null,
  cwd: over.cwd ?? '/app',
})

describe('buildSessionList', () => {
  it('unions our records with unwrapped harness transcripts (no writes)', async () => {
    const db = testDb()
    await createSession(db, {
      id: 'conciv_a',
      harnessSessionId: 'tok-a',
      harnessKind: 'claude',
      origin: 'chat',
      title: 'Mine',
      model: null,
      usage: null,
      cwd: '/app',
    })
    const harnessList = [
      {id: 'tok-a', derivedTitle: 'ignored', updatedAt: 10, messageCount: 3},
      {id: 'tok-ext', derivedTitle: 'External', updatedAt: 20, messageCount: 1},
    ]
    const rows = await buildSessionList({db, harnessList, running: () => false, cwd: '/app'})
    const mine = rows.find((r) => r.id === 'conciv_a')!
    const ext = rows.find((r) => r.id === 'tok-ext')!
    expect(mine.title).toBe('Mine')
    expect(ext.origin).toBe('external')
    expect(await sessionByHarnessId(db, 'tok-ext')).toBeNull()
  })

  it('scopes records to the current cwd (trailing-slash tolerant)', async () => {
    const db = testDb()
    await createSession(db, rec({id: 'conciv_here', title: 'Here', cwd: '/app'}))
    await createSession(db, rec({id: 'conciv_there', title: 'There', cwd: '/other'}))
    const rows = await buildSessionList({db, harnessList: [], running: () => false, cwd: '/app/'})
    expect(rows.map((r) => r.id)).toEqual(['conciv_here'])
  })
})

describe('sweepEmptyChatRecords', () => {
  it('deletes empty chat ghosts; keeps titled, tokened, and external/agent', async () => {
    const db = testDb()
    await createSession(db, rec({id: 'conciv_ghost'}))
    await createSession(db, rec({id: 'conciv_titled', title: 'Kept'}))
    await createSession(db, rec({id: 'conciv_run', harnessSessionId: 'tok'}))
    await createSession(db, rec({id: 'conciv_ext', origin: 'external'}))
    await createSession(db, rec({id: 'conciv_agent', origin: 'agent'}))
    await sweepEmptyChatRecords(db)
    const ids = (await db.select().from(sessions)).map((r) => r.id).toSorted()
    expect(ids).toEqual(['conciv_agent', 'conciv_ext', 'conciv_run', 'conciv_titled'])
  })
})
