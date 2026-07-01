import {describe, it, expect} from 'vitest'
import {memoryStore} from '../../helpers/memory-store.js'
import {resumeTokenFor, recordMintedToken, ensureChatRecord} from '../../../src/api/chat/turn.js'

describe('turn session helpers', () => {
  it('resumeTokenFor returns the stored harness token (null when new)', async () => {
    const store = memoryStore()
    await store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
    })
    expect(await resumeTokenFor(store, 'conciv_a')).toBeNull()
    await recordMintedToken(store, 'conciv_a', 'tok-1')
    expect(await resumeTokenFor(store, 'conciv_a')).toBe('tok-1')
  })

  it('ensureChatRecord lazily births a chat record with a null token', async () => {
    const store = memoryStore()
    expect(await store.get('conciv_b')).toBeNull()
    await ensureChatRecord(store, 'conciv_b', 'claude', '/app')
    const rec = await store.get('conciv_b')
    expect(rec?.origin).toBe('chat')
    expect(rec?.harnessSessionId).toBeNull()
    expect(rec?.cwd).toBe('/app')
  })

  it('ensureChatRecord is idempotent: never clobbers an existing record', async () => {
    const store = memoryStore()
    await ensureChatRecord(store, 'conciv_b', 'claude', '/app')
    await recordMintedToken(store, 'conciv_b', 'tok-1')
    await ensureChatRecord(store, 'conciv_b', 'claude', '/app')
    expect((await store.get('conciv_b'))?.harnessSessionId).toBe('tok-1')
  })
})
