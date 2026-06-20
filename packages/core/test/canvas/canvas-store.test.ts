import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, expect, test} from 'vitest'
import {createFsCanvasStore} from '../../src/canvas/canvas-store.js'

const state = {root: ''}
beforeAll(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'mandarax-canvas-'))
})
afterAll(async () => {
  await rm(state.root, {recursive: true, force: true})
})

test('save then load round-trips the snapshot bytes', async () => {
  const store = createFsCanvasStore({stateRoot: state.root, previewId: 'local'})
  const snapshot = new Uint8Array([1, 2, 3, 250, 0, 42])
  await store.save('sess-1', snapshot)
  const loaded = await store.load('sess-1')
  expect(loaded).not.toBeNull()
  expect([...loaded!]).toEqual([...snapshot])
})

test('load returns null for an unknown session (no file)', async () => {
  const store = createFsCanvasStore({stateRoot: state.root, previewId: 'local'})
  expect(await store.load('does-not-exist')).toBeNull()
})

test('save overwrites the previous snapshot for the same session', async () => {
  const store = createFsCanvasStore({stateRoot: state.root, previewId: 'local'})
  await store.save('sess-2', new Uint8Array([9]))
  await store.save('sess-2', new Uint8Array([7, 7]))
  const loaded = await store.load('sess-2')
  expect([...loaded!]).toEqual([7, 7])
})
