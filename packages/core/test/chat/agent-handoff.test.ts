import {describe, it, expect} from 'vitest'
import {testDb} from '../helpers/memory-store.js'
import {ensureAgentRecord} from '../../src/chat/session.js'

describe('ensureAgentRecord', () => {
  it('wraps an initial harness id as an conciv_ record (origin agent), idempotent', async () => {
    const db = testDb()
    const a = await ensureAgentRecord({db, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_seed'}, 'tok-init')
    expect(a.origin).toBe('agent')
    const b = await ensureAgentRecord(
      {db, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_other'},
      'tok-init',
    )
    expect(b.id).toBe('conciv_seed')
  })
})
