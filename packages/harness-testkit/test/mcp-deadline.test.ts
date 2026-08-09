import {setTimeout as delay} from 'node:timers/promises'
import {afterEach, expect, it} from 'vitest'
import {z} from 'zod'
import {makeRunTypescript} from '../src/call-tool.js'
import {serveApp} from '../src/serve-app.js'
import {until} from '../src/until.js'

const JsonRpcMessageSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string(),
    params: z.object({protocolVersion: z.string().optional()}).loose().optional(),
  })
  .loose()

type FakeMcp = {base: string; streamOpen: () => boolean; initialized: () => boolean}

const openServers: Array<() => Promise<void>> = []

afterEach(async () => {
  const closers = openServers.splice(0)
  for (const close of closers) await close()
})

async function fakeMcp(initializeDelayMs: number): Promise<FakeMcp> {
  const state = {streamOpen: false, initialized: false}
  const served = await serveApp(async (request) => {
    if (request.method === 'GET') {
      state.streamOpen = true
      request.signal.addEventListener('abort', () => {
        state.streamOpen = false
      })
      const body = new ReadableStream<Uint8Array>({
        cancel: () => {
          state.streamOpen = false
        },
      })
      return new Response(body, {headers: {'content-type': 'text/event-stream'}})
    }
    if (request.method !== 'POST') return new Response(null, {status: 200})
    const message = JsonRpcMessageSchema.parse(await request.json())
    if (message.method === 'initialize') {
      await delay(initializeDelayMs)
      return Response.json(
        {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
            capabilities: {tools: {}},
            serverInfo: {name: 'fake-mcp', version: '0.0.0'},
          },
        },
        {headers: {'mcp-session-id': 'fake-session'}},
      )
    }
    if (message.id === undefined) {
      if (message.method === 'notifications/initialized') state.initialized = true
      return new Response(null, {status: 202})
    }
    return new Promise<Response>(() => {})
  })
  openServers.push(() => served.close())
  return {base: served.base, streamOpen: () => state.streamOpen, initialized: () => state.initialized}
}

it('spends one budget across the whole MCP call instead of one budget per stage', async () => {
  const mcp = await fakeMcp(600)
  const started = Date.now()
  await expect(
    makeRunTypescript(mcp.base, 'session', {deadlineMs: 900, label: 'page.fill'})('return 1'),
  ).rejects.toThrow(/page\.fill.*900ms.*listing/)
  expect(Date.now() - started).toBeLessThan(1_200)
}, 10_000)

it('closes an MCP client that connects after its deadline', async () => {
  const mcp = await fakeMcp(500)
  await expect(makeRunTypescript(mcp.base, 'session', {deadlineMs: 150})('return 1')).rejects.toThrow(/connecting/)
  await until(() => mcp.initialized(), {hangGuardMs: 3_000})
  await until(() => !mcp.streamOpen(), {hangGuardMs: 3_000, settleFor: 700})
}, 10_000)
