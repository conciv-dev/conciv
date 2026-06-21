import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import * as Y from 'yjs'
import {afterEach, expect, test} from 'vitest'
import {ORIGIN, type SnapshotStore} from '@mandarax/protocol/sync-types'
import {createLiveDb} from '../../src/db/live-db.js'
import {createSnapshotStore} from '../../src/sync/snapshot-store.js'
import {createSync} from '../../src/sync/sync.js'
import {createTrailSupervisor, type TrailSupervisor} from '../../src/db/trail-supervisor.js'

const dirs: string[] = []
const sups: TrailSupervisor[] = []

afterEach(async () => {
  for (const sup of sups.splice(0)) await sup.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

function memoryStore(): SnapshotStore & {saved: Map<string, Uint8Array>} {
  const saved = new Map<string, Uint8Array>()
  return {saved, load: async (room) => saved.get(room) ?? null, save: async (room, ybin) => void saved.set(room, ybin)}
}

function settingUpdate(key: string, value: string): Uint8Array {
  const src = new Y.Doc()
  src.getMap('data').set(key, value)
  return Y.encodeStateAsUpdate(src)
}

test('the snapshot store round-trips a ybin blob through trail', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-snap-'))
  dirs.push(dir)
  const port = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${port}`, dataDir: dir})
  const store = createSnapshotStore(db)
  const sup = createTrailSupervisor({dataDir: dir, port})
  sups.push(sup)
  await sup.start()
  const bytes = settingUpdate('k', 'v')
  await store.save('room-a', bytes)
  const loaded = await store.load('room-a')
  expect(loaded && Array.from(loaded)).toEqual(Array.from(bytes))
  expect(await store.load('missing')).toBeNull()
})

test('engine room applies updates, notifies observers, and rehydrates from the store', async () => {
  const store = memoryStore()
  store.saved.set('preview:session', settingUpdate('hello', 'world'))
  const {engine} = createSync({store})
  const room = engine.room('preview:session')
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(room.doc.getMap('data').get('hello')).toBe('world')

  const origins: unknown[] = []
  room.observe((_update, origin) => origins.push(origin))
  room.apply(settingUpdate('k', 'v'), ORIGIN.USER)
  expect(room.doc.getMap('data').get('k')).toBe('v')
  expect(origins).toContain(ORIGIN.USER)
})
