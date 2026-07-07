import {describe, it, expect, expectTypeOf, beforeAll, afterAll} from 'vitest'
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {hc} from 'hono/client'
import type {InferResponseType} from 'hono/client'
import type {AppType} from '@conciv/core'
import type {z} from 'zod'
import {SessionId, ChatSessionSchema, ChatSessionsSchema, ChatModelsSchema, OkSchema} from '@conciv/protocol/chat-types'
import {defineClient} from '../src/api-client.js'

let server: Server
let base = ''
let lastSessionHeader: string | null = null
beforeAll(async () => {
  server = createServer((req, res) => {
    lastSessionHeader = (req.headers['conciv-session-id'] as string | undefined) ?? null
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/chat/session/resolve') return void res.end(JSON.stringify({sessionId: 'conciv_x'}))
    if (req.url === '/api/chat/sessions') return void res.end(JSON.stringify({sessions: []}))
    if (req.url === '/api/chat/stop') return void res.end(JSON.stringify({ok: true}))
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

describe('defineClient (real server)', () => {
  it('resolve() returns the branded id; the header is attached only after setSessionId', async () => {
    const client = defineClient({apiBase: base})
    expect((await client.resolve()).sessionId).toBe('conciv_x')
    expect(lastSessionHeader).toBeNull()
    client.setSessionId(SessionId.parse('conciv_x'))
    await client.sessions()
    expect(lastSessionHeader).toBe('conciv_x')
    expect(client.chatStreamUrl()).toBe(`${base}/api/chat`)
  })

  it('attachUrl() points at the attach endpoint', () => {
    const client = defineClient({apiBase: base})
    expect(client.attachUrl()).toBe(`${base}/api/chat/attach`)
  })

  it('stop() POSTs and returns ok with the session header', async () => {
    const client = defineClient({apiBase: base})
    client.setSessionId(SessionId.parse('conciv_x'))
    expect((await client.stop()).ok).toBe(true)
    expect(lastSessionHeader).toBe('conciv_x')
  })
})

describe('error + type contracts', () => {
  it('rejects with ApiError carrying path and status on non-2xx', async () => {
    const client = defineClient({apiBase: base})
    await expect(client.models()).rejects.toMatchObject({path: '/api/chat/models', status: 404})
  })
})

describe('hc response types match protocol schemas', () => {
  const pin = hc<AppType>('http://x')

  it('pins inferred route types to zod outputs', () => {
    expectTypeOf<InferResponseType<typeof pin.api.chat.sessions.$get>>().toEqualTypeOf<
      z.output<typeof ChatSessionsSchema>
    >()
    expectTypeOf<InferResponseType<typeof pin.api.chat.session.$get>>().toEqualTypeOf<
      z.output<typeof ChatSessionSchema>
    >()
    expectTypeOf<InferResponseType<typeof pin.api.chat.stop.$post>>().toEqualTypeOf<z.output<typeof OkSchema>>()
    expectTypeOf<InferResponseType<typeof pin.api.chat.models.$get>>().toEqualTypeOf<
      z.output<typeof ChatModelsSchema>
    >()
  })
})
