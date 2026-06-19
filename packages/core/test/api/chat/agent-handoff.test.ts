import {describe, it, expect} from 'vitest'
import {memoryStore} from '../../helpers/memory-store.js'
import {ensureAgentRecord} from '../../../src/api/chat/chat.js'

describe('ensureAgentRecord', () => {
  it('wraps an initial harness id as an mandarax_ record (origin agent), idempotent', async () => {
    const store = memoryStore()
    const a = await ensureAgentRecord(
      {store, harnessKind: 'claude', cwd: '/app', mintId: () => 'mandarax_seed'},
      'tok-init',
    )
    expect(a.origin).toBe('agent')
    const b = await ensureAgentRecord(
      {store, harnessKind: 'claude', cwd: '/app', mintId: () => 'mandarax_other'},
      'tok-init',
    )
    expect(b.id).toBe('mandarax_seed') // idempotent by harness id
  })
})
