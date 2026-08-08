import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import type {RpcClient} from '@conciv/contract'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'

const AddressSchema = z.object({base: z.string(), wsUrl: z.string()})

async function openFakeCore(): Promise<{client: RpcClient; socket: WebSocket}> {
  const payload: unknown = await fetch('/__fake-core').then((response) => response.json())
  const socket = new WebSocket(AddressSchema.parse(payload).wsUrl)
  return {client: rpcOverWebsocket<RpcClient>(socket), socket}
}

describe('the apps/conciv fake core answers the production rpc client over a real websocket', () => {
  it('serves the canned session list to a client that never touches http', async () => {
    const {client, socket} = await openFakeCore()
    const sessions = await client.sessions.list(undefined)
    expect(sessions[0]?.id).toBe('conciv_1')
    socket.close()
  })

  it('streams the transcript snapshot and the run chunks a send produces', async () => {
    const {client, socket} = await openFakeCore()
    const abort = new AbortController()
    const stream = await client.chat.subscribe({sessionId: 'conciv_1'}, {signal: abort.signal})
    const seen: string[] = []
    const collected = (async () => {
      for await (const chunk of stream) {
        const type = typeof chunk === 'object' && chunk !== null && 'type' in chunk ? String(chunk.type) : ''
        seen.push(type)
        if (type === 'RUN_FINISHED') return
      }
    })()
    await client.chat.send({sessionId: 'conciv_1', runId: 'conciv_run_1', text: 'hello'})
    await collected
    abort.abort()
    expect(seen[0]).toBe('MESSAGES_SNAPSHOT')
    expect(seen).toContain('RUN_STARTED')
    expect(seen.at(-1)).toBe('RUN_FINISHED')
    socket.close()
  })
})
