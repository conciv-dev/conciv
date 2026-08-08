import {describe, expect, it} from 'vitest'
import {Hono} from 'hono'
import {os} from '@orpc/server'
import {z} from 'zod'
import {rpcWebsocketRoute, RPC_WS_PATH, type UpgradeWebSocket} from '../src/rpc-mount.js'

const router = {ping: os.input(z.object({value: z.string()})).handler(({input}) => ({pong: input.value}))}

const strandedUpgrade: UpgradeWebSocket = () => () => Promise.resolve(new Response(null, {status: 500}))

const adaptedUpgrade: UpgradeWebSocket = () => () => Promise.resolve(new Response())

function upgradeRequest(): Request {
  return new Request(`http://127.0.0.1${RPC_WS_PATH}`, {
    headers: {upgrade: 'websocket', connection: 'Upgrade'},
  })
}

describe('the rpc websocket route refuses to fail silently', () => {
  it('reports a split @hono/node-server instance instead of closing the socket quietly', async () => {
    const reported: string[] = []
    const app = new Hono().get(
      RPC_WS_PATH,
      rpcWebsocketRoute(router, {upgrade: strandedUpgrade, onError: (message) => reported.push(message)}),
    )
    const response = await app.fetch(upgradeRequest())
    expect(response.status).toBe(500)
    expect(reported.join('\n')).toContain('different @hono/node-server module instance')
  })

  it('passes an upgrade the adapter accepted straight through', async () => {
    const reported: string[] = []
    const app = new Hono().get(
      RPC_WS_PATH,
      rpcWebsocketRoute(router, {upgrade: adaptedUpgrade, onError: (message) => reported.push(message)}),
    )
    const response = await app.fetch(upgradeRequest())
    expect(response.status).toBe(200)
    expect(reported).toEqual([])
  })

  it('leaves a plain request on the route alone', async () => {
    const app = new Hono().get(
      RPC_WS_PATH,
      rpcWebsocketRoute(router, {upgrade: () => () => Promise.resolve(new Response('not an upgrade', {status: 426}))}),
    )
    const response = await app.fetch(new Request(`http://127.0.0.1${RPC_WS_PATH}`))
    expect(response.status).toBe(426)
  })
})
