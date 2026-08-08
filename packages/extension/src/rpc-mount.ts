import type {AnyRouter} from '@orpc/server'
import {RPCHandler} from '@orpc/server/fetch'
import {RPCHandler as WebsocketRPCHandler, type MinimalWebsocket} from '@orpc/server/websocket'
import type {Context, MiddlewareHandler} from 'hono'
import type {WSContext, WSEvents, WSMessageReceive} from 'hono/ws'
import type {StandardRPCHandlerOptions} from '@orpc/server/standard'
import type {RpcContext} from '@conciv/protocol/rpc-types'

const ADAPTER_REFUSED_STATUS = 500

export const RPC_PREFIX = '/rpc'
export const RPC_WS_PATH = '/rpc-ws'

export type UpgradeWebSocket = (createEvents: (c: Context) => WSEvents) => MiddlewareHandler

export function rpcConnectionContext(requestUrl: string): RpcContext {
  return {origin: new URL(requestUrl).origin, headers: {}}
}

export function rpcHandlerOptions(): StandardRPCHandlerOptions<RpcContext> {
  return {
    rootInterceptors: [
      (options) => options.next({...options, context: {...options.context, headers: options.request.headers}}),
    ],
  }
}

export type MountedExtensionRouter = {slug: string; extensionName: string; router: AnyRouter}

export type CompositeRpcRouter<TCore = AnyRouter> = TCore & {ext: Record<string, AnyRouter>}

export function makeCompositeRpcRouter<TCore>(
  core: TCore,
  extensions: readonly MountedExtensionRouter[],
): CompositeRpcRouter<TCore> {
  const owners = new Map<string, string>()
  for (const entry of extensions) {
    const existing = owners.get(entry.slug)
    if (existing !== undefined) {
      throw new Error(
        `extension rpc slug collision: "${entry.slug}" is claimed by both "${existing}" and "${entry.extensionName}"`,
      )
    }
    owners.set(entry.slug, entry.extensionName)
  }
  return {...core, ext: Object.fromEntries(extensions.map((entry) => [entry.slug, entry.router]))}
}

export function rpcFetchMiddleware(router: AnyRouter): MiddlewareHandler {
  const handler = new RPCHandler<RpcContext>(router, rpcHandlerOptions())
  return async (c, next) => {
    const {matched, response} = await handler.handle(c.req.raw, {
      prefix: RPC_PREFIX,
      context: rpcConnectionContext(c.req.url),
    })
    if (matched && response) return c.newResponse(response.body, response)
    await next()
  }
}

function peerFrame(data: WSMessageReceive): string | ArrayBuffer | null {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return data
  return null
}

function peerSocket(held: {socket: WSContext<unknown> | null}): MinimalWebsocket {
  return {
    addEventListener: () => {},
    send: (data: string | ArrayBuffer) => held.socket?.send(data),
  }
}

function splitAdapterError(): Error {
  return new Error(
    'the rpc websocket upgrade was refused by the hono node-server adapter: the upgradeWebSocket passed to rpcWebsocketRoute comes from a different @hono/node-server module instance than the running server. Import it from @conciv/serve so both come from one instance.',
  )
}

export function rpcWebsocketRoute(
  router: AnyRouter,
  options: {upgrade: UpgradeWebSocket; onError?: (message: string) => void},
): MiddlewareHandler {
  const handler = new WebsocketRPCHandler<RpcContext>(router, rpcHandlerOptions())
  const route = options.upgrade((c) => {
    const context = rpcConnectionContext(c.req.url)
    const held: {socket: WSContext<unknown> | null} = {socket: null}
    const peer = peerSocket(held)
    return {
      onMessage: (event, ws) => {
        held.socket = ws
        const frame = peerFrame(event.data)
        if (frame === null) return
        handler.message(peer, frame, {context}).catch((error: unknown) => {
          options.onError?.(`rpc ws frame rejected: ${String(error)}`)
          handler.close(peer)
          ws.close(1011, 'rpc frame rejected')
        })
      },
      onClose: () => handler.close(peer),
    }
  })
  return async (c, next) => {
    const adapted = {handled: false}
    const response = await route(c, async () => {
      adapted.handled = true
      await next()
    })
    const upgrading = c.req.header('upgrade')?.toLowerCase() === 'websocket'
    const refused = response instanceof Response && response.status === ADAPTER_REFUSED_STATUS
    if (adapted.handled || !upgrading || !refused) return response
    const failure = splitAdapterError()
    options.onError?.(failure.message)
    throw failure
  }
}
