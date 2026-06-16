import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {SessionId} from '@aidx/protocol/chat-types'
import {defineClient} from '../src/session-client.js'

// Real server — NO mocks. Captures the last session header it actually received.
let server: Server
let base = ''
let lastSessionHeader: string | null = null
beforeAll(async () => {
  server = createServer((req, res) => {
    lastSessionHeader = (req.headers['aidx-session-id'] as string | undefined) ?? null
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/chat/session/resolve') return void res.end(JSON.stringify({sessionId: 'aidx_x'}))
    if (req.url === '/api/chat/sessions') return void res.end(JSON.stringify({sessions: []}))
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
    expect((await client.resolve()).sessionId).toBe('aidx_x') // no header before set
    expect(lastSessionHeader).toBeNull()
    client.setSessionId(SessionId.parse('aidx_x'))
    await client.sessions()
    expect(lastSessionHeader).toBe('aidx_x') // server actually received our id
    expect(client.chatStreamUrl()).toBe(`${base}/api/chat`)
  })
})
