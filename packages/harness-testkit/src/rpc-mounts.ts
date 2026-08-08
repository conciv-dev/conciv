import {Hono} from 'hono'
import {cors} from 'hono/cors'
import type {AnyRouter} from '@orpc/server'
import {
  makeCompositeRpcRouter,
  RPC_PREFIX,
  RPC_WS_PATH,
  rpcFetchMiddleware,
  rpcWebsocketRoute,
} from '@conciv/extension/rpc-mount'
import {serveHono, upgradeWebSocket} from '@conciv/serve'

export type ServedRpcRouter = {
  base: string
  wsBase: string
  rpcUrl: string
  wsUrl: string
  port: number
  unref: () => void
  close: () => Promise<void>
}

export async function serveRpcRouter(options: {router: AnyRouter; app?: Hono}): Promise<ServedRpcRouter> {
  const app = options.app ?? new Hono().use(cors())
  app.get(RPC_WS_PATH, rpcWebsocketRoute(options.router, {upgrade: upgradeWebSocket}))
  app.use(`${RPC_PREFIX}/*`, rpcFetchMiddleware(options.router))
  const served = await serveHono({fetch: app.fetch})
  const base = `http://127.0.0.1:${served.port}`
  const wsBase = base.replace('http:', 'ws:')
  return {
    base,
    wsBase,
    rpcUrl: `${base}${RPC_PREFIX}`,
    wsUrl: `${wsBase}${RPC_WS_PATH}`,
    port: served.port,
    unref: () => {
      served.server.unref()
    },
    close: served.close,
  }
}

export async function serveExtensionRpc(options: {
  slug: string
  router: AnyRouter
  app?: Hono
}): Promise<ServedRpcRouter> {
  const composite = makeCompositeRpcRouter({}, [
    {slug: options.slug, extensionName: options.slug, router: options.router},
  ])
  const served = await serveRpcRouter({router: composite, app: options.app})
  return {...served, rpcUrl: `${served.base}${RPC_PREFIX}/ext/${options.slug}`}
}
