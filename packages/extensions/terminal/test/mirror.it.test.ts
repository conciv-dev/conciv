import {randomUUID} from 'node:crypto'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import type {UIMessage} from '@conciv/protocol/chat-types'
import {bashHarness, startTerminalServer, type TerminalTestServer} from './helpers.js'
import {until} from '@conciv/harness-testkit'

describe('terminal mirror route', () => {
  const sessionId = `conciv_${randomUUID()}`
  const transcript: UIMessage[] = [{id: 'h1', role: 'user', parts: [{type: 'text', content: 'hello'}]}]
  const ctx: {server?: TerminalTestServer} = {}

  beforeAll(async () => {
    ctx.server = await startTerminalServer({
      ...bashHarness,
      transcriptMessages: () => Promise.resolve([...transcript]),
    })
    ctx.server.sessions.tokens.set(sessionId, randomUUID())
  })

  afterAll(() => ctx.server?.close())

  it('reports NO_TRANSCRIPT without a recorded token', async () => {
    const other = `conciv_${randomUUID()}`
    const rpc = ctx.server?.rpc
    if (!rpc) throw new Error('server not started')
    const mirror = await rpc.mirror({sessionId: other})
    await expect(mirror.next()).rejects.toMatchObject({code: 'NO_TRANSCRIPT'})
  })

  it('streams the current transcript and re-emits on growth', async () => {
    const rpc = ctx.server?.rpc
    if (!rpc) throw new Error('server not started')
    const controller = new AbortController()
    const mirror = await rpc.mirror({sessionId}, {signal: controller.signal})
    const payloads: {messages: UIMessage[]}[] = []
    const pump = (async () => {
      for await (const payload of mirror) payloads.push(payload)
    })()
    await until(() => payloads.length >= 1)
    expect(payloads[0]?.messages.map((m) => m.role)).toEqual(['user'])
    transcript.push({id: 'h2', role: 'assistant', parts: [{type: 'text', content: 'hi there'}]})
    await until(() => payloads.length >= 2)
    expect(payloads.at(-1)?.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    controller.abort()
    await pump.catch(() => {})
  })
})
