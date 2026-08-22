import {describe, it, expect} from 'vitest'
import {eq} from 'drizzle-orm'
import {sessions} from '@conciv/db'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {testDb} from '../helpers/memory-store.js'
import {createRow, openNativeRow, resolveRow, rowById, sweepEmptyRows} from '../../src/chat/session-rows.js'

const MINTED = SessionId.parse('conciv_minted')
const OTHER = SessionId.parse('conciv_other')

const scopeOf = (db = testDb(), cwd = '/app') => ({db, harnessKind: 'claude', cwd, mintId: () => MINTED})

const rowOf = (overrides: Partial<Parameters<typeof createRow>[1]> = {}) => ({
  id: OTHER,
  harnessSessionId: null,
  harnessKind: 'claude',
  origin: 'chat' as const,
  title: null,
  model: null,
  usage: null,
  cwd: '/app',
  deletedAt: null,
  ...overrides,
})

describe('resolveRow reopen-latest stays inside the caller scope', () => {
  it('ignores the latest row of a different working directory and mints instead', async () => {
    const db = testDb()
    await createRow(db, rowOf({cwd: '/elsewhere'}))
    const {sessionId} = await resolveRow(scopeOf(db, '/app'), {})
    expect(sessionId).toBe(MINTED)
    expect((await rowById(db, OTHER))?.cwd).toBe('/elsewhere')
  })

  it('ignores an external row minted for a headless caller and mints a chat row instead', async () => {
    const db = testDb()
    await createRow(db, rowOf({origin: 'external'}))
    const {sessionId} = await resolveRow(scopeOf(db), {})
    expect(sessionId).toBe(MINTED)
    expect((await rowById(db, MINTED))?.origin).toBe('chat')
  })

  it('ignores an agent row so an mcp mint is never handed to the widget', async () => {
    const db = testDb()
    await createRow(db, rowOf({origin: 'agent', harnessSessionId: HarnessSessionId.parse('tok-agent')}))
    const {sessionId} = await resolveRow(scopeOf(db), {})
    expect(sessionId).toBe(MINTED)
  })

  it('still reopens the latest chat row of this working directory', async () => {
    const db = testDb()
    await createRow(db, rowOf())
    const {sessionId} = await resolveRow(scopeOf(db), {})
    expect(sessionId).toBe(OTHER)
  })
})

describe('sweepEmptyRows reaps every unused mint, not only the chat ones', () => {
  it('reaps an external row that was minted for a headless caller and never used', async () => {
    const db = testDb()
    await createRow(db, rowOf({origin: 'external'}))
    await sweepEmptyRows(db)
    expect(await rowById(db, OTHER)).toBeNull()
  })

  it('keeps an external row that carries a harness session', async () => {
    const db = testDb()
    await createRow(db, rowOf({origin: 'external', harnessSessionId: HarnessSessionId.parse('tok-kept')}))
    await sweepEmptyRows(db)
    expect(await rowById(db, OTHER)).not.toBeNull()
  })

  it('keeps an external row that carries a title', async () => {
    const db = testDb()
    await createRow(db, rowOf({origin: 'external', title: 'named by the user'}))
    await sweepEmptyRows(db)
    expect(await rowById(db, OTHER)).not.toBeNull()
  })

  it('keeps an agent row so an mcp session survives a restart', async () => {
    const db = testDb()
    await createRow(db, rowOf({origin: 'agent'}))
    await sweepEmptyRows(db)
    expect(await rowById(db, OTHER)).not.toBeNull()
  })
})

describe('openNativeRow is safe against a concurrent list of the same native session', () => {
  it('two concurrent opens of one native session leave exactly one row', async () => {
    const db = testDb()
    const ids = {n: 0}
    const scope = {
      db,
      harnessKind: 'claude',
      cwd: '/app',
      mintId: () => {
        ids.n += 1
        return SessionId.parse(`conciv_race${ids.n}`)
      },
    }
    const ref = {harnessKind: 'claude', cwd: '/app', nativeId: HarnessSessionId.parse('tok-race')}
    const [first, second] = await Promise.all([openNativeRow(scope, ref), openNativeRow(scope, ref)])
    expect(first.sessionId).toBe(second.sessionId)
    const rows = await db.select().from(sessions).where(eq(sessions.harnessSessionId, 'tok-race'))
    expect(rows).toHaveLength(1)
  })
})
