import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {PINS_KEY, type PinGeometry} from '../src/room.js'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, runToolApproved, sessionId} from './helpers/run-tool.js'

const state: {stack?: Stack} = {}

beforeAll(async () => {
  state.stack = await bootStack()
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

const pinOf = (stack: Stack, sid: string, cid: string): PinGeometry | undefined =>
  stack.sync.engine.room(`local:${sid}`).doc.getMap<PinGeometry>(PINS_KEY).get(cid)

const rowsOf = (stack: Stack, cid: string) => stack.db.get('comments')!.query({cid})

describe('comment.create/delete (it) — one execute, dual-writes row + Yjs pin', () => {
  it('writes the row and a locked pin, and deletes both (delete gated by approval)', async () => {
    const stack = state.stack!
    const sid = sessionId('dualwrite')
    const cid = crypto.randomUUID()

    const created = await runTool(stack.core, sid, 'comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'pinned here'}],
      x: 120,
      y: 240,
      author_kind: 'human',
    })
    expect(created.status).toBe(200)

    const rows = await rowsOf(stack, cid)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({cid, preview_id: 'local', session_id: sid, kind: 'floating'})
    expect(pinOf(stack, sid, cid)).toEqual({cid, x: 120, y: 240, elementId: null, pinState: 'locked'})

    const refused = await runTool(stack.core, sid, 'comment.delete', {cid})
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({needsApproval: true, name: 'comment.delete'})
    expect(await rowsOf(stack, cid)).toHaveLength(1)
    expect(pinOf(stack, sid, cid)).toBeTruthy()

    const deleted = await runToolApproved(stack.core, sid, 'comment.delete', {cid})
    expect(deleted.status).toBe(200)
    expect(await rowsOf(stack, cid)).toHaveLength(0)
    expect(pinOf(stack, sid, cid)).toBeUndefined()
  })
})
