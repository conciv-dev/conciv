import {describe, it, expect} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {testDb} from '../helpers/memory-store.js'
import {createRow, resolveRow, rowById} from '../../src/chat/session-rows.js'

const SESSION_NEW = SessionId.parse('conciv_new')
const SESSION_A = SessionId.parse('conciv_a')

const deps = (db = testDb()) => ({db, harnessKind: 'claude', cwd: '/app', mintId: () => SESSION_NEW})

describe('resolveRow', () => {
  it('no id on an empty engine → mints AND persists the row, so every caller can converge on it', async () => {
    const d = deps()
    const {sessionId} = await resolveRow(d, {})
    expect(sessionId).toBe('conciv_new')
    expect((await rowById(d.db, SESSION_NEW))?.origin).toBe('chat')
  })
  it('no id with rows present → returns the latest row instead of minting a second one', async () => {
    const db = testDb()
    await createRow(db, {
      id: SESSION_A,
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
      deletedAt: null,
    })
    const {sessionId} = await resolveRow(deps(db), {})
    expect(sessionId).toBe('conciv_a')
    expect(await rowById(db, SESSION_NEW)).toBeNull()
  })
  it('our id → returns it unchanged', async () => {
    const db = testDb()
    await createRow(db, {
      id: SESSION_A,
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
  it('an unknown conciv id → materializes the row, so the very next session-scoped call can use it', async () => {
    const d = deps()
    const {sessionId} = await resolveRow(d, {id: 'conciv_a'})
    expect(sessionId).toBe('conciv_a')
    expect((await rowById(d.db, SESSION_A))?.cwd).toBe('/app')
  })
  it('harness id → adopts (idempotent by harnessSessionId)', async () => {
    const d = deps()
    const first = await resolveRow(d, {id: 'tok-ext'})
    const again = await resolveRow(d, {id: 'tok-ext'})
    expect(first.sessionId).toBe(again.sessionId)
    expect((await rowById(d.db, first.sessionId))?.origin).toBe('external')
  })
})
