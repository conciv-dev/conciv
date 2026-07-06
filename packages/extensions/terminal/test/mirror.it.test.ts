import {randomUUID} from 'node:crypto'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {UIMessage} from '@conciv/protocol/chat-types'
import {bashHarness, startTerminalServer, type TerminalTestServer} from './helpers.js'
import {until} from '@conciv/harness-testkit'

function sseEvents(onPayload: (payload: {messages: UIMessage[]}) => void): (chunk: string) => void {
  const state = {buffer: ''}
  return (chunk) => {
    state.buffer += chunk
    const events = state.buffer.split('\n\n')
    state.buffer = events.pop() ?? ''
    for (const eventBlock of events) {
      const data = eventBlock
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('')
      if (data) onPayload(JSON.parse(data) as {messages: UIMessage[]})
    }
  }
}

describe('terminal mirror route', () => {
  const sessionId = `conciv_${randomUUID()}`
  const headers = {[CONCIV_SESSION_HEADER]: sessionId}
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

  it('404s without a recorded token', async () => {
    const other = `conciv_${randomUUID()}`
    const res = await fetch(`${ctx.server?.base}/api/ext/terminal/mirror`, {
      headers: {[CONCIV_SESSION_HEADER]: other},
    })
    expect(res.status).toBe(404)
  })

  it('streams the current transcript and re-emits on growth', async () => {
    const controller = new AbortController()
    const res = await fetch(`${ctx.server?.base}/api/ext/terminal/mirror`, {headers, signal: controller.signal})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const payloads: {messages: UIMessage[]}[] = []
    const feed = sseEvents((payload) => payloads.push(payload))
    const reader = res.body?.getReader()
    if (!reader) throw new Error('no body')
    const decoder = new TextDecoder()
    const pump = (async () => {
      for (;;) {
        const {done, value} = await reader.read()
        if (done) return
        feed(decoder.decode(value, {stream: true}))
      }
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
