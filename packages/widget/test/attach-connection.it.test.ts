import {createServer, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {setMaxListeners} from 'node:events'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineClient} from '@conciv/api-client'
import {attachConnection} from '../src/client/attach-connection.js'
import {until} from '@conciv/harness-testkit/until'

const chunkLines = (chunks: StreamChunk[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
const started = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'} as StreamChunk
const finished = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'} as StreamChunk

function drainAll(
  adapter: {subscribe: (signal: AbortSignal) => AsyncIterable<unknown>},
  signal: AbortSignal,
): Promise<void> {
  async function drain(): Promise<void> {
    for await (const chunk of adapter.subscribe(signal)) void chunk
  }
  return drain().catch(() => {})
}

describe('attachConnection', () => {
  const state = {
    server: undefined as Server | undefined,
    base: '',
    posts: [] as unknown[],
    attachCount: 0,
    failAttach: false,
    holdAttach: false,
    held: [] as ServerResponse[],
  }

  beforeAll(async () => {
    state.server = createServer((req, res) => {
      if (req.url === '/api/chat' && req.method === 'POST') {
        let body = ''
        req.on('data', (part) => (body += String(part)))
        req.on('end', () => {
          state.posts.push(JSON.parse(body))
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ok: true}))
        })
        return
      }
      if (req.url === '/api/chat/attach') {
        state.attachCount += 1
        if (state.failAttach) {
          res.statusCode = 500
          res.end()
          return
        }
        res.setHeader('content-type', 'text/event-stream')
        if (state.holdAttach) {
          res.write(chunkLines([started]))
          state.held.push(res)
          return
        }
        res.write(chunkLines([started, finished]))
        res.end()
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((resolve) => state.server?.listen(0, '127.0.0.1', resolve))
    const address = state.server?.address() as AddressInfo
    state.base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    for (const res of state.held) res.end()
    state.held = []
    await new Promise((resolve) => state.server?.close(resolve))
  })

  it('send POSTs a ChatRequest body and resolves on ok', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client)
    await adapter.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hi'}]}], {model: 'haiku'})
    expect(state.posts.at(-1)).toMatchObject({messages: [{id: 'u1'}], forwardedProps: {model: 'haiku'}})
  })

  it('send merges requestMeta into forwardedProps under per-send data', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client, {requestMeta: () => ({model: 'opus', intent: 'chat'})})
    await adapter.send([{id: 'u2', role: 'user', parts: [{type: 'text', content: 'hi'}]}], {intent: 'compact'})
    expect(state.posts.at(-1)).toMatchObject({forwardedProps: {model: 'opus', intent: 'compact'}})
  })

  it('subscribe parses SSE chunks and reconnects after the stream ends', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client, {retryDelayMs: 20})
    const controller = new AbortController()
    const seen: StreamChunk[] = []
    async function drain(): Promise<void> {
      for await (const chunk of adapter.subscribe(controller.signal)) {
        seen.push(chunk)
        if (seen.length >= 4) controller.abort()
      }
    }
    const drainPromise = drain().catch(() => {})
    await until(() => seen.length >= 4, {hangGuardMs: 3000, intervalMs: 20})
    controller.abort()
    await drainPromise
    expect(seen.length).toBeGreaterThanOrEqual(4)
    expect(state.attachCount).toBeGreaterThanOrEqual(2)
    expect(seen[0]?.type).toBe(EventType.RUN_STARTED)
  })

  it('reports onConnectionChange false while attach fails and true once it recovers', async () => {
    const client = defineClient({apiBase: state.base})
    const changes: boolean[] = []
    state.failAttach = true
    const adapter = attachConnection(client, {retryDelayMs: 10, onConnectionChange: (c) => changes.push(c)})
    const controller = new AbortController()
    const drainPromise = drainAll(adapter, controller.signal)
    await until(() => changes.includes(false), {hangGuardMs: 2000, intervalMs: 10})
    state.failAttach = false
    await until(() => changes.includes(true), {hangGuardMs: 2000, intervalMs: 10})
    controller.abort()
    await drainPromise
    expect(changes).toContain(false)
    expect(changes).toContain(true)
  })

  it('does not accumulate abort listeners across reconnect cycles', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client, {retryDelayMs: 10})
    const controller = new AbortController()
    setMaxListeners(5, controller.signal)
    const warnings: Error[] = []
    const onWarning = (warning: Error) => warnings.push(warning)
    process.on('warning', onWarning)
    const startCount = state.attachCount
    const drainPromise = drainAll(adapter, controller.signal)
    await until(() => state.attachCount - startCount >= 15, {hangGuardMs: 4000, intervalMs: 10})
    controller.abort()
    await drainPromise
    process.off('warning', onWarning)
    const maxListenerWarnings = warnings.filter((warning) => warning.name === 'MaxListenersExceededWarning')
    expect(maxListenerWarnings).toEqual([])
    expect(state.attachCount - startCount).toBeGreaterThanOrEqual(15)
  })

  it('bump reconnects immediately without waiting out the retry backoff', async () => {
    const client = defineClient({apiBase: state.base})
    const retryDelayMs = 1000
    const adapter = attachConnection(client, {retryDelayMs})
    const controller = new AbortController()
    state.holdAttach = true
    const startCount = state.attachCount
    const drainPromise = drainAll(adapter, controller.signal)
    await until(() => state.attachCount - startCount >= 1, {hangGuardMs: 2000, intervalMs: 5})
    expect(state.attachCount - startCount).toBe(1)
    const bumpedAt = Date.now()
    adapter.bump()
    await until(() => state.attachCount - startCount >= 2, {hangGuardMs: retryDelayMs, intervalMs: 5})
    const elapsed = Date.now() - bumpedAt
    controller.abort()
    await drainPromise
    state.holdAttach = false
    expect(state.attachCount - startCount).toBe(2)
    expect(elapsed).toBeLessThan(retryDelayMs / 2)
  })
})
