import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {callTool, sessionId} from './helpers/run-tool.js'
import {canvasClearDef, canvasDeleteDef} from '../src/tool/canvas/def.js'

const state: {stack: Stack} = {stack: undefined as never}

beforeAll(async () => {
  state.stack = await bootStack()
}, 60_000)

afterAll(async () => {
  await state.stack?.stop()
})

const parse = (result: unknown): {elements: {type: string}[]; drawn: string[]} => JSON.parse(String(result))

describe('whiteboard canvas tools (it) — agent writes via the backend db', () => {
  it('canvas.draw writes an element the same session reads back', async () => {
    const session = sessionId('canvasdraw')
    const drawn = parse(
      await callTool(state.stack.core, session, 'canvas.draw', {
        elements: [{type: 'rectangle', x: 0, y: 0, width: 100, height: 100}],
      }),
    )
    expect(drawn.drawn).toHaveLength(1)
    const read = parse(await callTool(state.stack.core, session, 'canvas.read', {}))
    expect(read.elements.some((element) => element.type === 'rectangle')).toBe(true)
  })

  it('scopes elements per session room (G1)', async () => {
    await callTool(state.stack.core, sessionId('scopeA'), 'canvas.draw', {elements: [{type: 'ellipse', x: 1, y: 1}]})
    const other = parse(await callTool(state.stack.core, sessionId('scopeB'), 'canvas.read', {}))
    expect(other.elements).toHaveLength(0)
  })

  it('declares destructive canvas tools as approval:ask (G2)', () => {
    expect(canvasDeleteDef.approval).toBe('ask')
    expect(canvasClearDef.approval).toBe('ask')
  })
})
