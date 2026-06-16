import {describe, it, expect} from 'vitest'
import {memoryStore} from '../../helpers/memory-store.js'
import {resumeTokenFor, recordMintedToken} from '../../../src/api/chat/turn.js'

describe('turn session helpers', () => {
  it('resumeTokenFor returns the stored harness token (null when new)', async () => {
    const store = memoryStore()
    await store.create({id: 'aidx_a', harnessSessionId: null, harnessKind: 'claude', origin: 'chat', title: null, model: null, usage: null, cwd: '/app'})
    expect(await resumeTokenFor(store, 'aidx_a')).toBeNull()
    await recordMintedToken(store, 'aidx_a', 'tok-1')
    expect(await resumeTokenFor(store, 'aidx_a')).toBe('tok-1')
  })
})
