import {describe, it, expect} from 'vitest'
import {memoryStore} from '../../helpers/memory-store.js'
import {resolveSession} from '../../../src/api/chat/session.js'

const deps = (store = memoryStore()) => ({store, harnessKind: 'claude', cwd: '/app', mintId: () => 'aidx_new'})

describe('resolveSession', () => {
  it('no id → mints a fresh id WITHOUT persisting (lazy birth on first turn)', async () => {
    const d = deps()
    const {sessionId} = await resolveSession(d, {})
    expect(sessionId).toBe('aidx_new')
    expect(await d.store.get('aidx_new')).toBeNull()
  })
  it('unknown aidx id (lost record) → mints fresh WITHOUT persisting', async () => {
    const d = deps()
    const {sessionId} = await resolveSession(d, {id: 'aidx_gone'})
    expect(sessionId).toBe('aidx_new')
    expect(await d.store.get('aidx_new')).toBeNull()
    expect(await d.store.get('aidx_gone')).toBeNull()
  })
  it('our id → returns it unchanged', async () => {
    const store = memoryStore()
    await store.create({
      id: 'aidx_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
    })
    const {sessionId} = await resolveSession(deps(store), {id: 'aidx_a'})
    expect(sessionId).toBe('aidx_a')
  })
  it('harness id → adopts (idempotent by harnessSessionId)', async () => {
    const d = deps()
    const first = await resolveSession(d, {id: 'tok-ext'})
    const again = await resolveSession(d, {id: 'tok-ext'})
    expect(first.sessionId).toBe(again.sessionId)
    expect((await d.store.get(first.sessionId))?.origin).toBe('external')
  })
})
