import * as Y from 'yjs'
import {expect, test} from 'vitest'
import {ORIGIN, type SnapshotStore} from '../src/shared/sync-types.js'
import {createSync} from '../src/server/sync/sync.js'

function memoryStore(): SnapshotStore & {saved: Map<string, Uint8Array>} {
  const saved = new Map<string, Uint8Array>()
  return {saved, load: async (room) => saved.get(room) ?? null, save: async (room, ybin) => void saved.set(room, ybin)}
}

function settingUpdate(key: string, value: string): Uint8Array {
  const src = new Y.Doc()
  src.getMap('data').set(key, value)
  return Y.encodeStateAsUpdate(src)
}

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
