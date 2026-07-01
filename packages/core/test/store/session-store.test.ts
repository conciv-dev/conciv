import {existsSync} from 'node:fs'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, it, expect} from 'vitest'
import {createFsSessionStore} from '../../src/store/session-store.js'
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

describe('createFsSessionStore (fs driver path)', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((dir) => rmSync(dir, {recursive: true, force: true})))

  it('writes session files directly under <stateRoot>/.conciv/sessions with no preview segment', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-fs-'))
    roots.push(stateRoot)
    const store = createFsSessionStore({stateRoot})
    await store.create({id: 'conciv_a', harnessSessionId: null, title: null, model: null, usage: null, ...base})
    expect(existsSync(join(stateRoot, '.conciv', 'sessions'))).toBe(true)
    expect((await store.get('conciv_a'))?.id).toBe('conciv_a')
  })
})
