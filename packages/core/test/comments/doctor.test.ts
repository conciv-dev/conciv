import {mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {createFsCanvasStore} from '../../src/canvas/canvas-store.js'
import {createCanvasRelay, type CanvasRelay} from '../../src/canvas/relay.js'
import {createCommentStore, type CommentStore} from '../../src/comments/comment-store.js'
import {createAnchorResolver} from '../../src/anchor/resolver.js'
import {createDoctor} from '../../src/comments/doctor.js'

const state = {root: '', relay: null as CanvasRelay | null, comments: null as CommentStore | null}
beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'mandarax-doctor-'))
})
afterEach(async () => {
  await state.relay?.dispose()
  state.comments?.close()
  await rm(state.root, {recursive: true, force: true})
})

async function writeSrc(rel: string, code: string): Promise<void> {
  await mkdir(join(state.root, 'src'), {recursive: true})
  await writeFile(join(state.root, rel), code, 'utf8')
}

function setup() {
  state.relay = createCanvasRelay({store: createFsCanvasStore({stateRoot: state.root, previewId: 'local'})})
  state.comments = createCommentStore({stateRoot: state.root})
  const resolver = createAnchorResolver({projectRoot: state.root})
  const doctor = createDoctor({comments: state.comments, resolver, relay: state.relay, sessionId: () => 'sess'})
  return {resolver, doctor, comments: state.comments, relay: state.relay}
}

async function pinComment(
  c: CommentStore,
  resolver: ReturnType<typeof createAnchorResolver>,
  id: string,
  line: number,
  col: number,
) {
  const anchor = await resolver.capture({file: 'src/App.tsx', line, col})
  return c.create({
    id,
    sessionId: 'sess',
    previewId: 'local',
    threadId: id,
    parts: [{type: 'text', text: 'note'}],
    authorKind: 'human',
    kind: 'source-linked',
    anchor,
    anchorFile: anchor.file,
    anchorHash: anchor.hash,
  })
}

test('a moved node is re-anchored, comment stays open', async () => {
  const {doctor, resolver, comments} = setup()
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Icon name="a" /></Row>\n)\n`)
  await pinComment(comments, resolver, 'c1', 2, 3)
  await writeSrc('src/App.tsx', `export const A = () => (\n\n\n  <Row><Icon name="a" /></Row>\n)\n`)
  const report = await doctor.run()
  expect(report.reAnchored).toBe(1)
  const c = comments.get('c1')!
  expect(c.status).toBe('open')
  expect((c.anchor as {line: number}).line).toBe(4)
})

test('a structurally changed node is flagged drifted', async () => {
  const {doctor, resolver, comments} = setup()
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Icon name="a" /></Row>\n)\n`)
  await pinComment(comments, resolver, 'c1', 2, 3)
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Button label="go" /></Row>\n)\n`)
  const report = await doctor.run()
  expect(report.drifted).toBe(1)
  expect(comments.get('c1')!.status).toBe('drifted')
})

test('a deleted file marks the comment orphaned', async () => {
  const {doctor, resolver, comments} = setup()
  await writeSrc('src/App.tsx', `export const A = () => (\n  <Row><Icon name="a" /></Row>\n)\n`)
  await pinComment(comments, resolver, 'c1', 2, 3)
  await rm(join(state.root, 'src/App.tsx'))
  const report = await doctor.run()
  expect(report.orphaned).toBe(1)
  expect(comments.get('c1')!.status).toBe('orphaned')
})

test('floating comments are skipped', async () => {
  const {doctor, comments} = setup()
  comments.create({
    id: 'f1',
    sessionId: 'sess',
    previewId: 'local',
    threadId: 'f1',
    parts: [{type: 'text', text: 'floating'}],
    authorKind: 'human',
    kind: 'floating',
  })
  const report = await doctor.run()
  expect(report).toEqual({fresh: 0, reAnchored: 0, drifted: 0, orphaned: 0, ambiguous: 0})
  expect(comments.get('f1')!.status).toBe('open')
})

test('reconciles the join: a pin with no comment row is dropped', async () => {
  const {doctor, relay} = setup()
  await relay.setPin('sess', {commentId: 'ghost', x: 1, y: 1, pinState: 'locked'})
  expect((await relay.pins('sess')).length).toBe(1)
  await doctor.run()
  expect(await relay.pins('sess')).toEqual([])
})
