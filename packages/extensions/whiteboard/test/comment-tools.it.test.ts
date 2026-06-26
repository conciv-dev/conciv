import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {callTool, sessionId} from './helpers/run-tool.js'
import {commentDeleteDef, commentResolveDef} from '../src/tool/comment/def.js'

const state: {stack: Stack} = {stack: undefined as never}

beforeAll(async () => {
  state.stack = await bootStack()
}, 60_000)

afterAll(async () => {
  await state.stack?.stop()
})

const parse = (
  result: unknown,
): {comment?: {status: string; parts: unknown[]}; replies?: unknown[]; comments?: {cid: string}[]} =>
  JSON.parse(String(result))

describe('whiteboard comment tools (it) — agent writes comments + pins', () => {
  it('creates a comment with a pin, threads replies, resolves, and deletes', async () => {
    const session = sessionId('comments')
    const cid = 'cid-1'
    await callTool(state.stack.core, session, 'comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'look here'}],
      x: 10,
      y: 20,
      authorKind: 'ai',
    })

    const read = parse(await callTool(state.stack.core, session, 'comment.read', {cid}))
    expect(read.comment?.status).toBe('open')
    expect(read.comment?.parts).toHaveLength(1)

    await callTool(state.stack.core, session, 'comment.move', {cid, x: 99, y: 99})

    await callTool(state.stack.core, session, 'comment.reply', {cid, parts: [{type: 'text', text: 'on it'}]})
    const threaded = parse(await callTool(state.stack.core, session, 'comment.read', {cid}))
    expect(threaded.replies).toHaveLength(1)

    const listed = parse(await callTool(state.stack.core, session, 'comment.list', {scope: 'session'}))
    expect(listed.comments?.some((row) => row.cid === cid)).toBe(true)

    await callTool(state.stack.core, session, 'comment.resolve', {cid})
    const resolved = parse(await callTool(state.stack.core, session, 'comment.read', {cid}))
    expect(resolved.comment?.status).toBe('resolved')

    await callTool(state.stack.core, session, 'comment.delete', {cid})
    const empty = parse(await callTool(state.stack.core, session, 'comment.list', {scope: 'session'}))
    expect(empty.comments?.some((row) => row.cid === cid)).toBe(false)
  })

  it('declares destructive comment tools as approval:ask (G2)', () => {
    expect(commentDeleteDef.approval).toBe('ask')
    expect(commentResolveDef.approval).toBe('ask')
  })
})
