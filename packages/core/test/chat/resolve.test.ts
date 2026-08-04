import {describe, it, expect} from 'vitest'
import {testDb} from '../helpers/memory-store.js'
import {createRow, resolveRow, rowById} from '../../src/chat/session-rows.js'

const deps = (db = testDb()) => ({db, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_new'})

describe('resolveRow', () => {
  it('no id → mints a fresh id WITHOUT persisting (lazy birth on first turn)', async () => {
    const d = deps()
    const {sessionId} = await resolveRow(d, {})
    expect(sessionId).toBe('conciv_new')
    expect(await rowById(d.db, 'conciv_new')).toBeNull()
  })
  it('our id → returns it unchanged', async () => {
    const db = testDb()
    await createRow(db, {
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
      deletedAt: null,
    })
    const {sessionId} = await resolveRow(deps(db), {id: 'conciv_a'})
    expect(sessionId).toBe('conciv_a')
  })
  it('harness id → adopts (idempotent by harnessSessionId)', async () => {
    const d = deps()
    const first = await resolveRow(d, {id: 'tok-ext'})
    const again = await resolveRow(d, {id: 'tok-ext'})
    expect(first.sessionId).toBe(again.sessionId)
    expect((await rowById(d.db, first.sessionId))?.origin).toBe('external')
  })
})
