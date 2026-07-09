import {describe, it, expect} from 'vitest'
import {useTestStorePlane} from '../../helpers/state-plane.js'
import {ensureAgentRecord} from '../../../src/api/chat/chat.js'

const plane = useTestStorePlane()

describe('ensureAgentRecord', () => {
  it('wraps an initial harness id as an conciv_ record (origin agent), idempotent', async () => {
    const store = plane().store
    const a = await ensureAgentRecord(
      {store, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_seed'},
      'tok-init',
    )
    expect(a.origin).toBe('agent')
    const b = await ensureAgentRecord(
      {store, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_other'},
      'tok-init',
    )
    expect(b.id).toBe('conciv_seed')
  })
})
