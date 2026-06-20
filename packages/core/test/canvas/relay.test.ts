import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as Y from 'yjs'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {createFsCanvasStore} from '../../src/canvas/canvas-store.js'
import {createCanvasRelay} from '../../src/canvas/relay.js'

const state = {root: ''}
beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'mandarax-relay-'))
})
afterEach(async () => {
  await rm(state.root, {recursive: true, force: true})
})

// Encode an update that adds one element to a fresh doc — what a client would send to the relay.
function elementUpdate(id: string): Uint8Array {
  const doc = new Y.Doc()
  doc.getMap('elements').set(id, {id, version: 1})
  return Y.encodeStateAsUpdate(doc)
}

test('applyUpdate broadcasts to subscribers and the snapshot reflects it', async () => {
  const relay = createCanvasRelay({store: createFsCanvasStore({stateRoot: state.root, previewId: 'local'})})
  const received: Uint8Array[] = []
  await relay.subscribe('s1', (u) => received.push(u))
  await relay.applyUpdate('s1', elementUpdate('a'))
  expect(received.length).toBe(1)
  // A fresh doc fed the relay snapshot sees the element.
  const mirror = new Y.Doc()
  Y.applyUpdate(mirror, await relay.snapshot('s1'))
  expect(mirror.getMap('elements').has('a')).toBe(true)
  await relay.dispose()
})

test('flush persists to .ybin and a new relay rehydrates from disk', async () => {
  const store = createFsCanvasStore({stateRoot: state.root, previewId: 'local'})
  const relay = createCanvasRelay({store})
  await relay.applyUpdate('s2', elementUpdate('b'))
  await relay.flush('s2')
  await relay.dispose()

  const reborn = createCanvasRelay({store})
  const mirror = new Y.Doc()
  Y.applyUpdate(mirror, await reborn.snapshot('s2'))
  expect(mirror.getMap('elements').has('b')).toBe(true)
  await reborn.dispose()
})

test('rehydrate on first access does not rebroadcast the loaded state', async () => {
  const store = createFsCanvasStore({stateRoot: state.root, previewId: 'local'})
  const seed = createCanvasRelay({store})
  await seed.applyUpdate('s3', elementUpdate('c'))
  await seed.flush('s3')
  await seed.dispose()

  const relay = createCanvasRelay({store})
  const received: Uint8Array[] = []
  await relay.subscribe('s3', (u) => received.push(u))
  // Subscribing + reading the rehydrated room must not fire the broadcast for the boot load.
  await relay.snapshot('s3')
  expect(received.length).toBe(0)
  await relay.dispose()
})
