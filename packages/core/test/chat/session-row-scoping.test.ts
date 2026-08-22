import {describe, it, expect} from 'vitest'
import {eq} from 'drizzle-orm'
import {sessions} from '@conciv/db'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {testDb} from '../helpers/memory-store.js'
import {
  anonymousExternalRow,
  createRow,
  ensureAgentRow,
  openNativeRow,
  resolveRow,
  rowById,
  sweepEmptyRows,
} from '../../src/chat/session-rows.js'

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

describe('raw native-id resolution stays inside the caller cwd', () => {
  it('resolveRow with a raw harness id resolves the row of the calling cwd, not a same-id row elsewhere', async () => {
    const db = testDb()
    const nativeId = HarnessSessionId.parse('shared-native-id')
    const here = SessionId.parse('conciv_here')
    const elsewhere = SessionId.parse('conciv_elsewhere')
    await createRow(db, rowOf({id: elsewhere, cwd: '/elsewhere', harnessSessionId: nativeId}))
    await createRow(db, rowOf({id: here, cwd: '/app', harnessSessionId: nativeId}))
    const {sessionId} = await resolveRow(scopeOf(db, '/app'), {id: nativeId})
    expect(sessionId).toBe(here)
  })

  it('ensureAgentRow with a raw harness id resolves the row of the calling cwd, not a same-id row elsewhere', async () => {
    const db = testDb()
    const nativeId = HarnessSessionId.parse('shared-native-id')
    const here = SessionId.parse('conciv_here')
    const elsewhere = SessionId.parse('conciv_elsewhere')
    await createRow(db, rowOf({id: elsewhere, cwd: '/elsewhere', harnessSessionId: nativeId, origin: 'agent'}))
    await createRow(db, rowOf({id: here, cwd: '/app', harnessSessionId: nativeId, origin: 'agent'}))
    const row = await ensureAgentRow({db, harnessKind: 'claude', cwd: '/app'}, nativeId)
    expect(row.id).toBe(here)
  })
})

describe('latestRow query stays bounded', () => {
  it('other-cwd rows never consume the caller cwd query window, so an existing session is still reopened', async () => {
    const db = testDb()
    const baseTime = 1_000_000
    await db.insert(sessions).values({...rowOf({cwd: '/app'}), createdAt: baseTime, updatedAt: baseTime})
    const noiseRows = Array.from({length: 60}, (_, index) => ({
      ...rowOf({id: SessionId.parse(`conciv_noise${index}`), cwd: '/noise', title: `noise ${index}`}),
      createdAt: baseTime + index + 1,
      updatedAt: baseTime + index + 1,
    }))
    await db.insert(sessions).values(noiseRows)
    const {sessionId} = await resolveRow(scopeOf(db, '/app'), {})
    expect(sessionId).toBe(OTHER)
  })
})

describe('an unidentified external caller reuses one row instead of minting per request', () => {
  it('repeated anonymous resolutions in one working directory settle on a single session row', async () => {
    const db = testDb()
    const ids = {n: 0}
    const scope = {
      db,
      harnessKind: 'claude',
      cwd: '/app',
      mintId: () => {
        ids.n += 1
        return SessionId.parse(`conciv_anon${ids.n}`)
      },
    }
    const first = await anonymousExternalRow(scope)
    const second = await anonymousExternalRow(scope)
    const third = await anonymousExternalRow(scope)
    expect([second, third]).toEqual([first, first])
    expect((await db.select().from(sessions)).length).toBe(1)
  })

  it('a different working directory gets its own anonymous row', async () => {
    const db = testDb()
    const ids = {n: 0}
    const mintId = () => {
      ids.n += 1
      return SessionId.parse(`conciv_anon${ids.n}`)
    }
    const here = await anonymousExternalRow({db, harnessKind: 'claude', cwd: '/app', mintId})
    const there = await anonymousExternalRow({db, harnessKind: 'claude', cwd: '/elsewhere', mintId})
    expect(here).not.toBe(there)
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
