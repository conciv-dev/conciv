import {describe, it, expect} from 'vitest'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {testDb} from '../helpers/memory-store.js'
import {ensureAgentRow} from '../../src/chat/session-rows.js'

const TOKEN = HarnessSessionId.parse('tok-init')

describe('ensureAgentRow', () => {
  it('wraps an initial harness id as an conciv_ record (origin agent), idempotent', async () => {
    const db = testDb()
    const a = await ensureAgentRow(
      {db, harnessKind: 'claude', cwd: '/app', mintId: () => SessionId.parse('conciv_seed')},
      TOKEN,
    )
    expect(a.origin).toBe('agent')
    const b = await ensureAgentRow(
      {db, harnessKind: 'claude', cwd: '/app', mintId: () => SessionId.parse('conciv_other')},
      TOKEN,
    )
    expect(b.id).toBe('conciv_seed')
  })
})
