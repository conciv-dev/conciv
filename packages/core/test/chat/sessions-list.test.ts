import {describe, it, expect} from 'vitest'
import {createRow, listSessionMetas, rowByNativeId, sweepEmptyRows} from '../../src/chat/session-rows.js'
import {sessions} from '@conciv/db'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
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
  deletedAt: null,
})

const listOf = (
  db: ReturnType<typeof testDb>,
  nativeList: Parameters<typeof listSessionMetas>[0]['nativeList'],
  cwd: string,
) =>
  listSessionMetas({
    db,
    harnessKind: 'claude',
    cwd,
    nativeList,
    running: new Set<string>(),
    model: () => null,
    includeHidden: false,
  })

describe('listSessionMetas', () => {
  it('unions our records with harness transcripts materialized into honest conciv session ids', async () => {
    const db = testDb()
    await createRow(db, {
      id: 'conciv_a',
      harnessSessionId: 'tok-a',
      harnessKind: 'claude',
      origin: 'chat',
      title: 'Mine',
      model: null,
      usage: null,
      cwd: '/app',
      deletedAt: null,
    })
    const harnessList = [
      {id: HarnessSessionId.parse('tok-a'), derivedTitle: 'ignored', updatedAt: 10, messageCount: 3},
      {id: HarnessSessionId.parse('tok-ext'), derivedTitle: 'External', updatedAt: 20, messageCount: 1},
    ]
    const rows = await listOf(db, harnessList, '/app')
    const mine = rows.find((r) => r.id === 'conciv_a')!
    const ext = rows.find((r) => r.native?.nativeId === 'tok-ext')!
    expect(mine.title).toBe('Mine')
    expect(ext.origin).toBe('external')
    expect(ext.id).not.toBe('tok-ext')
    expect(await rowByNativeId(db, HarnessSessionId.parse('tok-ext'))).not.toBeNull()
  })

  it('scopes records to the current cwd (trailing-slash tolerant)', async () => {
    const db = testDb()
    await createRow(db, rec({id: 'conciv_here', title: 'Here', cwd: '/app'}))
    await createRow(db, rec({id: 'conciv_there', title: 'There', cwd: '/other'}))
    const rows = await listOf(db, [], '/app/')
    expect(rows.map((r) => r.id)).toEqual(['conciv_here'])
  })

  it('skips a row with a legacy harness_session_id that fails the stricter schema instead of throwing', async () => {
    const db = testDb()
    await createRow(db, rec({id: 'conciv_healthy', title: 'Healthy'}))
    await db.insert(sessions).values({
      id: 'conciv_poisoned',
      harnessSessionId: 'has.dot/and space',
      harnessKind: 'claude',
      origin: 'chat',
      title: 'Poisoned',
      model: null,
      usage: null,
      cwd: '/app',
      deletedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const rows = await listOf(db, [], '/app')
    expect(rows.map((r) => r.id)).toEqual(['conciv_healthy'])
  })
})

describe('sweepEmptyRows', () => {
  it('deletes every untitled tokenless chat and external mint; keeps titled, tokened, and agent rows', async () => {
    const db = testDb()
    await createRow(db, rec({id: 'conciv_ghost'}))
    await createRow(db, rec({id: 'conciv_titled', title: 'Kept'}))
    await createRow(db, rec({id: 'conciv_run', harnessSessionId: 'tok'}))
    await createRow(db, rec({id: 'conciv_ext', origin: 'external'}))
    await createRow(db, rec({id: 'conciv_ext_named', origin: 'external', title: 'Named by the user'}))
    await createRow(db, rec({id: 'conciv_agent', origin: 'agent'}))
    await sweepEmptyRows(db)
    const ids = (await db.select().from(sessions)).map((r) => r.id).toSorted()
    expect(ids).toEqual(['conciv_agent', 'conciv_ext_named', 'conciv_run', 'conciv_titled'])
  })
})
