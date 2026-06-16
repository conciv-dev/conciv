import {describe, it, expect} from 'vitest'
import {buildSessionList} from '../../../src/api/chat/session.js'
import {memoryStore} from '../../helpers/memory-store.js'

describe('buildSessionList', () => {
  it('unions our records with unwrapped harness transcripts (no writes)', async () => {
    const store = memoryStore()
    await store.create({
      id: 'aidx_a',
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
    const rows = await buildSessionList({store, harnessList, runningKeys: new Set<string>()})
    const mine = rows.find((r) => r.id === 'aidx_a')!
    const ext = rows.find((r) => r.id === 'tok-ext')!
    expect(mine.title).toBe('Mine') // our record wins
    expect(ext.origin).toBe('external') // unwrapped transcript shown under its harness id
    expect(await store.findByHarnessId('tok-ext')).toBeNull() // list did NOT write
  })
})
