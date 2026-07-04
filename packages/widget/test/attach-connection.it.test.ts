import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {setMaxListeners} from 'node:events'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineClient} from '@conciv/api-client'
import {attachConnection} from '../src/client/attach-connection.js'

const chunkLines = (chunks: StreamChunk[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
const started = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'} as StreamChunk
const finished = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'} as StreamChunk

describe('attachConnection', () => {
  const state = {server: undefined as Server | undefined, base: '', posts: [] as unknown[], attachCount: 0}

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
        res.setHeader('content-type', 'text/event-stream')
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
    await new Promise((resolve) => state.server?.close(resolve))
  })

  it('send POSTs a ChatRequest body and resolves on ok', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client)
    await adapter.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hi'}]}], {model: 'haiku'})
    expect(state.posts.at(-1)).toMatchObject({messages: [{id: 'u1'}], forwardedProps: {model: 'haiku'}})
  })

  it('subscribe parses SSE chunks and reconnects after the stream ends', async () => {
    const client = defineClient({apiBase: state.base})
    const adapter = attachConnection(client, {retryDelayMs: 20})
    const controller = new AbortController()
    const seen: StreamChunk[] = []
    const drain = (async () => {
      for await (const chunk of adapter.subscribe(controller.signal)) {
        seen.push(chunk)
        if (seen.length >= 4) controller.abort()
      }
    })().catch(() => {})
    const deadline = Date.now() + 3000
    while (seen.length < 4 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
    controller.abort()
    await drain
    expect(seen.length).toBeGreaterThanOrEqual(4)
    expect(state.attachCount).toBeGreaterThanOrEqual(2)
    expect(seen[0]?.type).toBe(EventType.RUN_STARTED)
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
    const drain = (async () => {
      for await (const chunk of adapter.subscribe(controller.signal)) void chunk
    })().catch(() => {})
    const deadline = Date.now() + 4000
    while (state.attachCount - startCount < 15 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
    controller.abort()
    await drain
    process.off('warning', onWarning)
    const maxListenerWarnings = warnings.filter((warning) => warning.name === 'MaxListenersExceededWarning')
    expect(maxListenerWarnings).toEqual([])
    expect(state.attachCount - startCount).toBeGreaterThanOrEqual(15)
  })
})
