import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, runToolApproved, sessionId} from './helpers/run-tool.js'

const state: {stack?: Stack} = {}

beforeAll(async () => {
  state.stack = await bootStack()
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

describe('comment threads + list/read/reply/resolve (it)', () => {
  it('replies thread under a comment and lists top-level comments', async () => {
    const stack = state.stack!
    const sid = sessionId('thread')
    const root = crypto.randomUUID()

    expect(
      (
        await runTool(stack.core, sid, 'comment.create', {
          cid: root,
          kind: 'floating',
          parts: [{type: 'text', text: 'root comment'}],
          x: 10,
          y: 20,
          author_kind: 'human',
        })
      ).status,
    ).toBe(200)

    const replied = await runTool(stack.core, sid, 'comment.reply', {
      cid: root,
      parts: [{type: 'tool', name: 'canvas.draw', arguments: {elements: []}}],
      author_kind: 'ai',
    })
    expect(replied.status).toBe(200)
    const replyCid = ((await replied.json()) as {result: {cid: string}}).result.cid
    expect(typeof replyCid).toBe('string')

    const read = (await (await runTool(stack.core, sid, 'comment.read', {cid: root})).json()) as {
      result: {comment: {cid: string}; replies: {cid: string; parent_id: string | null; parts: unknown[]}[]}
    }
    expect(read.result.comment.cid).toBe(root)
    expect(read.result.replies.map((r) => r.cid)).toContain(replyCid)
    const reply = read.result.replies.find((r) => r.cid === replyCid)!
    expect(reply.parent_id).toBe(root)
    expect(reply.parts).toEqual([{type: 'tool', name: 'canvas.draw', arguments: {elements: []}}])

    const listed = (await (await runTool(stack.core, sid, 'comment.list', {scope: 'session'})).json()) as {
      result: {comments: {cid: string}[]}
    }
    const cids = listed.result.comments.map((c) => c.cid)
    expect(cids).toContain(root)
    expect(cids).not.toContain(replyCid)
  })

  it('resolves a comment only with approval', async () => {
    const stack = state.stack!
    const sid = sessionId('resolve')
    const cid = crypto.randomUUID()
    await runTool(stack.core, sid, 'comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'resolve me'}],
      x: 0,
      y: 0,
      author_kind: 'human',
    })

    const refused = await runTool(stack.core, sid, 'comment.resolve', {cid})
    expect(refused.status).toBe(403)

    expect((await runToolApproved(stack.core, sid, 'comment.resolve', {cid})).status).toBe(200)
    const read = (await (await runTool(stack.core, sid, 'comment.read', {cid})).json()) as {
      result: {comment: {status: string}}
    }
    expect(read.result.comment.status).toBe('resolved')
  })
})
