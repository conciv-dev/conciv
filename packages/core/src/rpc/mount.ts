import {implement} from '@orpc/server'
import {RPCHandler} from '@orpc/server/fetch'
import type {MiddlewareHandler} from 'hono'
import {contract} from '@conciv/contract'
import type {ChatTool} from '@conciv/protocol/chat-types'
import type {ChatDeps} from '../chat/runtime.js'
import type {Compactor} from '../chat/compact.js'
import type {OpenInEditor} from '../editor/open.js'
import type {OpenSourceFrames, OpenSourceStatus} from '../page/open-source.js'
import type {PageBus} from '../page/page.js'
import type {makeRpcRouter} from './router.js'

export type RpcContext = {request: Request}

export type RpcDeps = {
  chat: ChatDeps
  tools: ChatTool[]
  compactor: Compactor
  send: (sessionId: string, text: string) => Promise<void>
  openInEditor: OpenInEditor
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
  pageBus: PageBus
}

export const os = implement(contract).$context<RpcContext>()

export function rpcMiddleware(router: ReturnType<typeof makeRpcRouter>): MiddlewareHandler {
  const handler = new RPCHandler(router)
  return async (c, next) => {
    const {matched, response} = await handler.handle(c.req.raw, {prefix: '/rpc', context: {request: c.req.raw}})
    if (matched && response) return c.newResponse(response.body, response)
    await next()
  }
}
