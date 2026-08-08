import {implement, type AnyRouter} from '@orpc/server'
import {RPCHandler} from '@orpc/server/fetch'
import {RPCHandler as WebsocketRPCHandler, type MinimalWebsocket} from '@orpc/server/websocket'
import {upgradeWebSocket, type WebSocketLike} from '@hono/node-server'
import type {MiddlewareHandler} from 'hono'
import type {WSContext, WSMessageReceive} from 'hono/ws'
import {contract} from '@conciv/contract'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import type {ChatTool} from '@conciv/protocol/chat-types'
import type {ChatDeps} from '../../chat/runtime.js'
import type {Compactor, Send} from '../../chat/run.js'
import type {OpenSourceFrames, OpenSourceStatus} from '../../editor/open-source.js'
import type {ToolRegistry} from '@conciv/extension/registry'
import {rpcConnectionContext, rpcHandlerOptions} from '@conciv/extension/rpc-mount'
import {logError} from '../../lib/debug.js'
import type {PageEnv} from '../../page-bus.js'
import type {makeRpcRouter} from './router.js'

export const RPC_PREFIX = '/rpc'
export const RPC_WS_PATH = '/rpc-ws'

export type RpcDeps = {
  chat: ChatDeps
  tools: ChatTool[]
  compactor: Compactor
  send: Send
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
  page: PageEnv
  registry: ToolRegistry
  askTimeoutMs?: number
}

export const os = implement(contract).$context<RpcContext>()

export type MountedExtensionRouter = {slug: string; extensionName: string; router: AnyRouter}

export type CompositeRpcRouter = ReturnType<typeof makeRpcRouter> & {ext: Record<string, AnyRouter>}

export function makeCompositeRpcRouter(
  core: ReturnType<typeof makeRpcRouter>,
  extensions: readonly MountedExtensionRouter[],
): CompositeRpcRouter {
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

export function rpcFetchMiddleware(router: CompositeRpcRouter): MiddlewareHandler {
  const handler = new RPCHandler(router, rpcHandlerOptions())
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

function peerSocket(held: {socket: WSContext<WebSocketLike> | null}): MinimalWebsocket {
  return {
    addEventListener: () => {},
    send: (data: string | ArrayBuffer) => held.socket?.send(data),
  }
}

export function rpcWebsocketRoute(router: CompositeRpcRouter): MiddlewareHandler {
  const handler = new WebsocketRPCHandler(router, rpcHandlerOptions())
  return upgradeWebSocket((c) => {
    const context = rpcConnectionContext(c.req.url)
    const held: {socket: WSContext<WebSocketLike> | null} = {socket: null}
    const peer = peerSocket(held)
    return {
      onMessage: (event, ws) => {
        held.socket = ws
        const frame = peerFrame(event.data)
        if (frame === null) return
        handler.message(peer, frame, {context}).catch((error: unknown) => {
          logError(`[core] rpc ws frame rejected: ${String(error)}`)
          handler.close(peer)
          ws.close(1011, 'rpc frame rejected')
        })
      },
      onClose: () => handler.close(peer),
    }
  })
}
