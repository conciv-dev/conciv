import {describe, it, expect} from 'vitest'
import {testDb} from '../helpers/memory-store.js'
import {ensureAgentRow} from '../../src/chat/session-rows.js'

describe('ensureAgentRow', () => {
  it('wraps an initial harness id as an conciv_ record (origin agent), idempotent', async () => {
    const db = testDb()
    const a = await ensureAgentRow({db, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_seed'}, 'tok-init')
    expect(a.origin).toBe('agent')
    const b = await ensureAgentRow({db, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_other'}, 'tok-init')
    expect(b.id).toBe('conciv_seed')
  })
})
