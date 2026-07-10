import {describe, it, expect} from 'vitest'
import {testDb} from '../helpers/memory-store.js'
import {createSession, resolveSession, sessionById} from '../../src/chat/session.js'

const deps = (db = testDb()) => ({db, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_new'})

describe('resolveSession', () => {
  it('no id → mints a fresh id WITHOUT persisting (lazy birth on first turn)', async () => {
    const d = deps()
    const {sessionId} = await resolveSession(d, {})
    expect(sessionId).toBe('conciv_new')
    expect(await sessionById(d.db, 'conciv_new')).toBeNull()
  })
  it('unknown conciv id (lost record) → mints fresh WITHOUT persisting', async () => {
    const d = deps()
    const {sessionId} = await resolveSession(d, {id: 'conciv_gone'})
    expect(sessionId).toBe('conciv_new')
    expect(await sessionById(d.db, 'conciv_new')).toBeNull()
    expect(await sessionById(d.db, 'conciv_gone')).toBeNull()
  })
  it('our id → returns it unchanged', async () => {
    const db = testDb()
    await createSession(db, {
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
    })
    const {sessionId} = await resolveSession(deps(db), {id: 'conciv_a'})
    expect(sessionId).toBe('conciv_a')
  })
  it('harness id → adopts (idempotent by harnessSessionId)', async () => {
    const d = deps()
    const first = await resolveSession(d, {id: 'tok-ext'})
    const again = await resolveSession(d, {id: 'tok-ext'})
    expect(first.sessionId).toBe(again.sessionId)
    expect((await sessionById(d.db, first.sessionId))?.origin).toBe('external')
  })
})
