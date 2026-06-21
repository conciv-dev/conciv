import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {collectServerContributions} from '@mandarax/extensions'
import whiteboard from '../src/index.js'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, sessionId} from './helpers/run-tool.js'

describe('whiteboard loads', () => {
  it('contributes a server tool through collectServerContributions', () => {
    const c = collectServerContributions([whiteboard])
    expect(c.tools.map((t) => t.name)).toContain('whiteboard.ping')
  })
})

const state: {stack?: Stack} = {}

beforeAll(async () => {
  state.stack = await bootStack()
}, 90_000)

afterAll(async () => {
  await state.stack?.stop()
})

describe('whiteboard loads (it) — first-party on a booted stack', () => {
  it('answers whiteboard.ping with "pong" over /api/tools/run', async () => {
    const res = await runTool(state.stack!.core, sessionId('loads'), 'whiteboard.ping', {})
    expect(res.status).toBe(200)
    expect((await res.json()) as {result: unknown}).toEqual({result: 'pong'})
  })
})
