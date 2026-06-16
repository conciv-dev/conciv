import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {z} from 'zod'
import {createTransport} from '../src/transport.js'

// Real server — NO mocks. It echoes the received session header so we assert what actually went over the wire.
let server: Server
let base = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/p') return void res.end(JSON.stringify({ok: true, echo: req.headers['aidx-session-id'] ?? null}))
    res.statusCode = 500
    res.end('nope')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

describe('createTransport (real server)', () => {
  it('route() parses the response and sends the injected header', async () => {
    const t = createTransport({apiBase: base, headers: () => ({'aidx-session-id': 'aidx_1'})})
    const out = await t.route({method: 'POST', path: '/api/p', request: z.object({a: z.number()}), response: z.object({ok: z.boolean(), echo: z.string().nullable()})})({a: 1})
    expect(out).toEqual({ok: true, echo: 'aidx_1'})
  })
  it('throws ApiError on non-2xx', async () => {
    const t = createTransport({apiBase: base})
    await expect(t.route({method: 'GET', path: '/api/missing', response: z.object({})})()).rejects.toThrow()
  })
})
