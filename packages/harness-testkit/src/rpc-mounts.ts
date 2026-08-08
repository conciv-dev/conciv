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
import {serveHono} from '@conciv/serve'

export type ServedRpcRouter = {
  base: string
  wsBase: string
  rpcUrl: string
  wsUrl: string
  port: number
  unref: () => void
  close: () => Promise<void>
}

export async function serveRpcRouter(opts: {router: AnyRouter; app?: Hono}): Promise<ServedRpcRouter> {
  const app = opts.app ?? new Hono().use(cors())
  app.get(RPC_WS_PATH, rpcWebsocketRoute(opts.router))
  app.use(`${RPC_PREFIX}/*`, rpcFetchMiddleware(opts.router))
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

export async function serveExtensionRpc(opts: {slug: string; router: AnyRouter; app?: Hono}): Promise<ServedRpcRouter> {
  const composite = makeCompositeRpcRouter({}, [{slug: opts.slug, extensionName: opts.slug, router: opts.router}])
  const served = await serveRpcRouter({router: composite, app: opts.app})
  return {...served, rpcUrl: `${served.base}${RPC_PREFIX}/ext/${opts.slug}`}
}
