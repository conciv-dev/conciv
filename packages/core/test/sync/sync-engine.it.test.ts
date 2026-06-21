import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import * as Y from 'yjs'
import {afterEach, expect, test} from 'vitest'
import {ORIGIN} from '@mandarax/protocol/sync-types'
import {createLiveDb} from '../../src/db/live-db.js'
import {createSnapshotStore} from '../../src/sync/snapshot-store.js'
import {createSyncEngine} from '../../src/sync/sync-engine.js'
import {createTrailSupervisor, type TrailSupervisor} from '../../src/db/trail-supervisor.js'

const dirs: string[] = []
const sups: TrailSupervisor[] = []

afterEach(async () => {
  for (const sup of sups.splice(0)) await sup.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

async function bootStore() {
  const dir = mkdtempSync(join(tmpdir(), 'mx-sync-'))
  dirs.push(dir)
  const port = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${port}`, dataDir: dir})
  const store = createSnapshotStore(db)
  const sup = createTrailSupervisor({dataDir: dir, port})
  sups.push(sup)
  await sup.start()
  return store
}

function updateSetting(key: string, value: string): Uint8Array {
  const src = new Y.Doc()
  src.getMap('data').set(key, value)
  return Y.encodeStateAsUpdate(src)
}

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('condition not met in time')
}

test('snapshot store round-trips a ybin blob by room', async () => {
  const store = await bootStore()
  const bytes = updateSetting('k', 'v')
  await store.save('room-a', bytes)
  const loaded = await store.load('room-a')
  expect(loaded && Array.from(loaded)).toEqual(Array.from(bytes))
  expect(await store.load('room-missing')).toBeNull()
})

test('apply mutates the doc and notifies observers', async () => {
  const store = await bootStore()
  const engine = createSyncEngine({store})
  const room = engine.room('r1')
  const origins: unknown[] = []
  room.observe((_update, origin) => origins.push(origin))
  room.apply(updateSetting('k', 'v'), ORIGIN.USER)
  expect(room.doc.getMap('data').get('k')).toBe('v')
  expect(origins).toContain(ORIGIN.USER)
})

test('a fresh engine rehydrates equal state under the REHYDRATE origin', async () => {
  const store = await bootStore()
  const room = createSyncEngine({store}).room('r2')
  room.apply(updateSetting('hello', 'world'), ORIGIN.USER)
  await waitUntil(async () => (await store.load('r2')) !== null)

  const room2 = createSyncEngine({store}).room('r2')
  const origins: unknown[] = []
  room2.observe((_update, origin) => origins.push(origin))
  await waitUntil(() => room2.doc.getMap('data').get('hello') === 'world')
  expect(room2.doc.getMap('data').get('hello')).toBe('world')
  expect(origins).toContain(ORIGIN.REHYDRATE)
})
