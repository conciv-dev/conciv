import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {collectServerContributions} from '@mandarax/extensions'
import {createFsCanvasStore} from '../../src/canvas/canvas-store.js'
import {createCanvasRelay, type CanvasRelay} from '../../src/canvas/relay.js'
import {createCommentStore, type CommentStore} from '../../src/comments/comment-store.js'
import {createCanvasCommentsExtension} from '../../src/extensions/canvas-comments/index.js'

const state = {root: '', relay: null as CanvasRelay | null, comments: null as CommentStore | null}
beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'mandarax-cc-ext-'))
})
afterEach(async () => {
  await state.relay?.dispose()
  state.comments?.close()
  await rm(state.root, {recursive: true, force: true})
})

let idCounter = 0
function setup() {
  state.relay = createCanvasRelay({store: createFsCanvasStore({stateRoot: state.root, previewId: 'local'})})
  state.comments = createCommentStore({stateRoot: state.root})
  idCounter = 0
  const ext = createCanvasCommentsExtension({
    relay: state.relay,
    comments: state.comments,
    sessionId: () => 'sess',
    previewId: () => 'local',
    genId: () => `gen-${++idCounter}`,
  })
  const contributions = collectServerContributions([ext])
  const tool = (name: string) => {
    const t = contributions.tools.find((x) => x.name === name)
    if (!t) throw new Error(`tool ${name} not registered`)
    return t
  }
  return {tool}
}

test('registers canvas + comment agent tools', () => {
  const {tool} = setup()
  for (const name of ['canvas.read', 'canvas.draw', 'comment.create', 'comment.list', 'comment.delete']) {
    expect(tool(name).name).toBe(name)
  }
})

test('canvas.draw writes elements that canvas.read returns', async () => {
  const {tool} = setup()
  await tool('canvas.draw').execute({elements: [{id: 'rect-1', version: 1, type: 'rectangle'}]})
  const read = (await tool('canvas.read').execute({})) as {elements: {id: string}[]}
  expect(read.elements.map((e) => e.id)).toEqual(['rect-1'])
})

test('comment.create writes BOTH the row and the Yjs pin under one id (the join)', async () => {
  const {tool} = setup()
  const created = (await tool('comment.create').execute({
    parts: [{type: 'text', text: 'fix me'}],
    kind: 'source-linked',
    anchorFile: 'src/X.tsx',
    pin: {x: 10, y: 20, elementId: 'rect-1'},
  })) as {id: string}
  expect(created.id).toBe('gen-1')
  // row exists
  const listed = (await tool('comment.list').execute({})) as {comments: {id: string}[]}
  expect(listed.comments.map((c) => c.id)).toEqual(['gen-1'])
  // pin exists, keyed by the same id
  const pins = await state.relay!.pins('sess')
  expect(pins).toEqual([{commentId: 'gen-1', x: 10, y: 20, elementId: 'rect-1', pinState: 'locked'}])
})

test('comment.delete removes BOTH the row and the pin', async () => {
  const {tool} = setup()
  await tool('comment.create').execute({parts: [{type: 'text', text: 'x'}], pin: {x: 1, y: 1}})
  await tool('comment.delete').execute({id: 'gen-1'})
  expect(((await tool('comment.list').execute({})) as {comments: unknown[]}).comments).toEqual([])
  expect(await state.relay!.pins('sess')).toEqual([])
})

test('comment.reply threads under the parent; comment.resolve greys it', async () => {
  const {tool} = setup()
  await tool('comment.create').execute({parts: [{type: 'text', text: 'parent'}]})
  const reply = (await tool('comment.reply').execute({
    parentId: 'gen-1',
    parts: [{type: 'text', text: 'child'}],
  })) as {threadId: string; parentId: string}
  expect(reply.threadId).toBe('gen-1')
  expect(reply.parentId).toBe('gen-1')
  const resolved = (await tool('comment.resolve').execute({id: 'gen-1', by: 'human'})) as {status: string}
  expect(resolved.status).toBe('resolved')
})
