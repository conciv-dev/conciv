import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {PINS_KEY, type PinGeometry} from '../src/room.js'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, sessionId} from './helpers/run-tool.js'

const state: {stack?: Stack} = {}

beforeAll(async () => {
  state.stack = await bootStack()
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

const pinOf = (stack: Stack, sid: string, cid: string): PinGeometry | undefined =>
  stack.sync.engine.room(`local:${sid}`).doc.getMap<PinGeometry>(PINS_KEY).get(cid)

describe('comment.move / pin.setState (it) — AI pin geometry control', () => {
  it('moves a pin and flips its state, preserving the rest of the geometry', async () => {
    const stack = state.stack!
    const sid = sessionId('pinmove')
    const cid = crypto.randomUUID()
    await runTool(stack.core, sid, 'comment.create', {
      cid,
      kind: 'source-linked',
      parts: [{type: 'text', text: 'drag me'}],
      x: 100,
      y: 100,
      elementId: 'el-1',
      author_kind: 'ai',
    })
    expect(pinOf(stack, sid, cid)).toMatchObject({x: 100, y: 100, pinState: 'locked', elementId: 'el-1'})

    expect((await runTool(stack.core, sid, 'comment.move', {cid, x: 250, y: 320})).status).toBe(200)
    expect(pinOf(stack, sid, cid)).toMatchObject({x: 250, y: 320, pinState: 'locked', elementId: 'el-1'})

    expect((await runTool(stack.core, sid, 'pin.setState', {cid, pinState: 'offset'})).status).toBe(200)
    expect(pinOf(stack, sid, cid)).toMatchObject({x: 250, y: 320, pinState: 'offset', elementId: 'el-1'})
  })
})
