import {describe, it, expect} from 'vitest'
import {memoryStore} from '../helpers/memory-store.js'

const base = {harnessKind: 'claude', origin: 'chat' as const, cwd: '/app'}

describe('SessionStore (memory driver)', () => {
  it('create → get round-trips', async () => {
    const store = memoryStore()
    const rec = await store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      title: null,
      model: null,
      usage: null,
      ...base,
    })
    expect(await store.get('conciv_a')).toEqual(rec)
  })
  it('update merges a patch and bumps updatedAt', async () => {
    const store = memoryStore()
    await store.create({id: 'conciv_a', harnessSessionId: null, title: null, model: null, usage: null, ...base})
    const updated = await store.update('conciv_a', {harnessSessionId: 'tok-1', title: 'Hi'})
    expect(updated.harnessSessionId).toBe('tok-1')
    expect(updated.title).toBe('Hi')
  })
  it('list returns all records; delete removes one', async () => {
    const store = memoryStore()
    await store.create({id: 'conciv_a', harnessSessionId: null, title: null, model: null, usage: null, ...base})
    await store.create({id: 'conciv_b', harnessSessionId: null, title: null, model: null, usage: null, ...base})
    expect((await store.list()).map((r) => r.id).toSorted()).toEqual(['conciv_a', 'conciv_b'])
    await store.delete('conciv_a')
    expect(await store.get('conciv_a')).toBeNull()
  })
  it('findByHarnessId returns the wrapping record (adopt idempotency)', async () => {
    const store = memoryStore()
    await store.create({id: 'conciv_a', harnessSessionId: 'tok-ext', title: null, model: null, usage: null, ...base})
    expect((await store.findByHarnessId('tok-ext'))?.id).toBe('conciv_a')
  })
})
