import {chmodSync, existsSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {createRecordingStore} from '../src/server/recordings.js'

const snapshot = (timestamp: number) => ({type: 2, data: {node: {}}, timestamp})
const event = (timestamp: number) => ({type: 3, data: {source: 2, type: 2, id: 1}, timestamp})

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'rec-'))
}

function freshStore() {
  return createRecordingStore(freshDir())
}

describe('recording store', () => {
  it('saves and gets by id', async () => {
    const store = freshStore()
    const saved = await store.save([snapshot(1), event(2)])
    if (!saved.ok) throw new Error('expected ok')
    expect(await store.get(saved.recordingId)).toEqual([snapshot(1), event(2)])
  })

  it('returns null for a missing id', async () => {
    expect(await freshStore().get('nope')).toBeNull()
  })

  it('rejects an empty recording', async () => {
    expect(await freshStore().save([snapshot(1)])).toEqual({ok: false, reason: 'empty'})
  })

  it('keeps the whole recording when it fits, even with a fresh snapshot at the tail', async () => {
    const store = freshStore()
    const saved = await store.save([snapshot(1), event(2), event(3), snapshot(4)])
    if (!saved.ok) throw new Error(`expected ok, got ${JSON.stringify(saved)}`)
    expect(await store.get(saved.recordingId)).toEqual([snapshot(1), event(2), event(3), snapshot(4)])
  })

  it('trims to the latest snapshot under the size cap', async () => {
    const store = freshStore()
    const bloated = {type: 3, data: {source: 0, blob: 'x'.repeat(17 * 1024 * 1024)}, timestamp: 2}
    const saved = await store.save([snapshot(1), bloated, snapshot(3), event(4)])
    if (!saved.ok) throw new Error('expected ok')
    expect(await store.get(saved.recordingId)).toEqual([snapshot(3), event(4)])
  })

  it('rejects when even the newest snapshot tail exceeds the cap', async () => {
    const store = freshStore()
    const huge = {type: 3, data: {source: 0, blob: 'x'.repeat(17 * 1024 * 1024)}, timestamp: 2}
    expect(await store.save([snapshot(1), huge])).toEqual({ok: false, reason: 'too-large'})
  })

  it('prunes to the newest 50 by id order', async () => {
    const store = freshStore()
    const ids: string[] = []
    for (let index = 0; index < 55; index += 1) {
      const saved = await store.save([snapshot(index), event(index + 1)])
      if (saved.ok) ids.push(saved.recordingId)
    }
    const oldest = ids[0]
    const newest = ids.at(-1)
    if (oldest === undefined || newest === undefined) throw new Error('expected ids')
    expect(await store.get(oldest)).toBeNull()
    expect(await store.get(newest)).not.toBeNull()
  })

  it('returns null for a corrupt recording file instead of throwing', async () => {
    const dir = freshDir()
    const store = createRecordingStore(dir)
    const saved = await store.save([snapshot(1), event(2)])
    if (!saved.ok) throw new Error('expected ok')
    writeFileSync(join(dir, `${saved.recordingId}.json`), '{corrupt', 'utf8')
    expect(await store.get(saved.recordingId)).toBeNull()
  })

  it('reports io-error when the directory is not writable, never throws', async () => {
    const dir = freshDir()
    chmodSync(dir, 0o500)
    const store = createRecordingStore(dir)
    expect(await store.save([snapshot(1), event(2)])).toEqual({ok: false, reason: 'io-error'})
    chmodSync(dir, 0o700)
  })

  it('sweep removes stray tmp files', async () => {
    const dir = freshDir()
    const store = createRecordingStore(dir)
    const saved = await store.save([snapshot(1), event(2)])
    if (!saved.ok) throw new Error('expected ok')
    writeFileSync(join(dir, '123-dead.json.tmp'), 'partial', 'utf8')
    await store.sweep()
    expect(await store.get(saved.recordingId)).not.toBeNull()
    expect(await store.get('123-dead')).toBeNull()
    expect(existsSync(join(dir, '123-dead.json.tmp'))).toBe(false)
  })
})
