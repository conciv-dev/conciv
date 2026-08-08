import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import type {RouterClient} from '@orpc/server'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'
import type {TestRunnerRouter} from '../src/server.js'

const FixtureAddressSchema = z.object({base: z.string(), wsUrl: z.string()})

async function fixtureAddress(): Promise<z.infer<typeof FixtureAddressSchema>> {
  const payload: unknown = await fetch('/__test-runner-fixture').then((response) => response.json())
  return FixtureAddressSchema.parse(payload)
}

async function openFixtureSocket(): Promise<{client: RouterClient<TestRunnerRouter>; socket: WebSocket}> {
  const socket = new WebSocket((await fixtureAddress()).wsUrl)
  return {client: rpcOverWebsocket<RouterClient<TestRunnerRouter>>(socket, {path: ['ext', 'test-runner']}), socket}
}

describe('the test-runner vite fixture serves rpc over a real websocket upgrade', () => {
  it('answers a unary procedure over the socket with the same payload as the fetch mount', async () => {
    const {client, socket} = await openFixtureSocket()
    const overSocket = await client.status({})
    const overFetch: unknown = await fetch(`${(await fixtureAddress()).base}/rpc/ext/test-runner/status`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({json: {}}),
    }).then((response) => response.json())
    expect(overSocket.summary).toEqual({passed: 1, failed: 1, skipped: 0, durationMs: 2})
    expect(JSON.stringify(overFetch)).toContain('"passed":1')
    socket.close()
  })

  it('streams the fixture run events over the socket iterator', async () => {
    const {client, socket} = await openFixtureSocket()
    const abort = new AbortController()
    const stream = await client.stream({}, {signal: abort.signal})
    const seen: string[] = []
    for await (const event of stream) {
      seen.push(event.type)
      if (event.type === 'run-end') break
    }
    abort.abort()
    expect(seen).toContain('run-start')
    expect(seen).toContain('test')
    expect(seen.at(-1)).toBe('run-end')
    socket.close()
  })
})
