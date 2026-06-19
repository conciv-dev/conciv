import {describe, it, expect} from 'vitest'
import {buildSessionList, sweepEmptyChatRecords} from '../../../src/api/chat/session.js'
import {memoryStore} from '../../helpers/memory-store.js'

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
    const store = memoryStore()
    await store.create({
      id: 'mandarax_a',
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
    const rows = await buildSessionList({store, harnessList, runningKeys: new Set<string>(), cwd: '/app'})
    const mine = rows.find((r) => r.id === 'mandarax_a')!
    const ext = rows.find((r) => r.id === 'tok-ext')!
    expect(mine.title).toBe('Mine') // our record wins
    expect(ext.origin).toBe('external') // unwrapped transcript shown under its harness id
    expect(await store.findByHarnessId('tok-ext')).toBeNull() // list did NOT write
  })

  it('scopes records to the current cwd (trailing-slash tolerant)', async () => {
    const store = memoryStore()
    await store.create(rec({id: 'mandarax_here', title: 'Here', cwd: '/app'}))
    await store.create(rec({id: 'mandarax_there', title: 'There', cwd: '/other'}))
    const rows = await buildSessionList({store, harnessList: [], runningKeys: new Set<string>(), cwd: '/app/'})
    expect(rows.map((r) => r.id)).toEqual(['mandarax_here'])
  })
})

describe('sweepEmptyChatRecords', () => {
  it('deletes empty chat ghosts; keeps titled, tokened, external/agent, and locked', async () => {
    const store = memoryStore()
    await store.create(rec({id: 'mandarax_ghost'})) // chat, null token, null title → swept
    await store.create(rec({id: 'mandarax_titled', title: 'Kept'})) // user title → kept
    await store.create(rec({id: 'mandarax_run', harnessSessionId: 'tok'})) // ran a turn → kept
    await store.create(rec({id: 'mandarax_ext', origin: 'external'})) // external → kept
    await store.create(rec({id: 'mandarax_agent', origin: 'agent'})) // agent → kept
    await store.create(rec({id: 'mandarax_live'})) // empty but locked (in-flight first turn) → kept
    await sweepEmptyChatRecords(store, new Set(['mandarax_live']))
    const ids = (await store.list()).map((r) => r.id).toSorted()
    expect(ids).toEqual(['mandarax_agent', 'mandarax_ext', 'mandarax_live', 'mandarax_run', 'mandarax_titled'])
  })
})
