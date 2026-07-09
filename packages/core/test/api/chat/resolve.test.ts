import {describe, it, expect} from 'vitest'
import {useTestStorePlane} from '../../helpers/state-plane.js'
import {resolveSession} from '../../../src/api/chat/session.js'

const plane = useTestStorePlane()

const deps = (store = plane().store) => ({store, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_new'})

describe('resolveSession', () => {
  it('no id → mints a fresh id WITHOUT persisting (lazy birth on first turn)', async () => {
    const d = deps()
    const {sessionId} = await resolveSession(d, {})
    expect(sessionId).toBe('conciv_new')
    expect(await d.store.get('conciv_new')).toBeNull()
  })
  it('unknown conciv id (lost record) → mints fresh WITHOUT persisting', async () => {
    const d = deps()
    const {sessionId} = await resolveSession(d, {id: 'conciv_gone'})
    expect(sessionId).toBe('conciv_new')
    expect(await d.store.get('conciv_new')).toBeNull()
    expect(await d.store.get('conciv_gone')).toBeNull()
  })
  it('our id → returns it unchanged', async () => {
    const store = plane().store
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
    const {sessionId} = await resolveSession(deps(store), {id: 'conciv_a'})
    expect(sessionId).toBe('conciv_a')
  })
  it('harness id → adopts (idempotent by harnessSessionId)', async () => {
    const d = deps()
    const first = await resolveSession(d, {id: 'tok-ext'})
    const again = await resolveSession(d, {id: 'tok-ext'})
    expect(first.sessionId).toBe(again.sessionId)
    expect((await d.store.get(first.sessionId))?.origin).toBe('external')
  })
})
