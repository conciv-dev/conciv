import {RPCHandler} from '@orpc/server/fetch'
import type {MiddlewareHandler} from 'hono'
import type {makeRpcRouter} from './router.js'

export function rpcMiddleware(router: ReturnType<typeof makeRpcRouter>): MiddlewareHandler {
  const handler = new RPCHandler(router)
  return async (c, next) => {
    const {matched, response} = await handler.handle(c.req.raw, {prefix: '/rpc', context: {request: c.req.raw}})
    if (matched && response) return c.newResponse(response.body, response)
    await next()
  }
}
