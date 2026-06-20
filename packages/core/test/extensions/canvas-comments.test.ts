import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {collectServerContributions} from '@mandarax/extensions'
import {createFsCanvasStore} from '../../src/canvas/canvas-store.js'
import {createCanvasRelay} from '../../src/canvas/relay.js'
import {createCanvasCommentsExtension} from '../../src/extensions/canvas-comments/index.js'

const state = {root: ''}
beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'mandarax-cc-ext-'))
})
afterEach(async () => {
  await rm(state.root, {recursive: true, force: true})
})

function setup() {
  const relay = createCanvasRelay({store: createFsCanvasStore({stateRoot: state.root, previewId: 'local'})})
  const ext = createCanvasCommentsExtension({relay, sessionId: () => 'sess'})
  const contributions = collectServerContributions([ext])
  const tool = (name: string) => {
    const t = contributions.tools.find((x) => x.name === name)
    if (!t) throw new Error(`tool ${name} not registered`)
    return t
  }
  return {relay, tool}
}

test('the built-in registers canvas.read + canvas.draw as agent tools', () => {
  const {tool} = setup()
  expect(tool('canvas.read').name).toBe('canvas.read')
  expect(tool('canvas.draw').name).toBe('canvas.draw')
})

test('canvas.draw writes elements that canvas.read returns', async () => {
  const {relay, tool} = setup()
  const drew = (await tool('canvas.draw').execute({
    elements: [{id: 'rect-1', version: 1, type: 'rectangle'}],
  })) as {ok: boolean; count: number}
  expect(drew).toEqual({ok: true, count: 1})

  const read = (await tool('canvas.read').execute({})) as {elements: {id: string}[]}
  expect(read.elements.map((e) => e.id)).toEqual(['rect-1'])
  await relay.dispose()
})

test('canvas.draw rejects an element missing a required field at the boundary', async () => {
  const {relay, tool} = setup()
  await expect(tool('canvas.draw').execute({elements: [{id: 'x'}]})).rejects.toThrow()
  await relay.dispose()
})
