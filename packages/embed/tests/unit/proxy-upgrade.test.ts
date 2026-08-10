import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'
import type {RpcClient} from '@conciv/contract'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'

let kit: EmbedKit

beforeAll(async () => {
  kit = await bootEmbedKit()
}, 60_000)

afterAll(async () => {
  await kit.cleanup()
})

function openSocket(proxy: ProxyCore): {socket: WebSocket; client: RpcClient; closed: Promise<number>} {
  const socket = new WebSocket(`${proxy.base.replace('http:', 'ws:')}/rpc-ws`)
  const closed = new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code)))
  return {socket, client: createORPCClient<RpcClient>(new RPCLink({websocket: socket})), closed}
}

describe('the embed test proxy carries the rpc websocket', () => {
  it('pipes the upgrade to the target core so a real rpc round trip completes through the proxy', async () => {
    const proxy = await proxyTo(kit.base)
    const {socket, client} = openSocket(proxy)
    const payload = await client.meta.tools(undefined)
    expect(payload.tools.length).toBeGreaterThan(0)
    expect(proxy.wsConnectionCount()).toBe(1)
    expect(proxy.requestCount()).toBe(0)
    socket.close()
    await proxy.close()
  })

  it('counts http requests and socket upgrades separately on the same proxy', async () => {
    const proxy = await proxyTo(kit.base)
    const {socket, client} = openSocket(proxy)
    await client.meta.tools(undefined)
    await fetch(`${proxy.base}/rpc/meta/tools`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({json: undefined, meta: []}),
    })
    expect(proxy.requestCount()).toBe(1)
    expect(proxy.wsConnectionCount()).toBe(1)
    socket.close()
    await proxy.close()
  })

  it('closing the proxy drops the piped socket so a reconnect gate can force a drop', async () => {
    const proxy = await proxyTo(kit.base)
    const {client, closed} = openSocket(proxy)
    await client.meta.tools(undefined)
    await proxy.close()
    expect(await closed).toBeGreaterThan(0)
  })
})
