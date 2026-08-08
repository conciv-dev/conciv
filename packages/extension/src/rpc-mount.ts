import type {RPCHandlerOptions} from '@orpc/server/fetch'
import type {RpcContext} from '@conciv/protocol/rpc-types'

export function rpcConnectionContext(requestUrl: string): RpcContext {
  return {origin: new URL(requestUrl).origin, headers: {}}
}

export function rpcHandlerOptions(): RPCHandlerOptions<RpcContext> {
  return {
    rootInterceptors: [
      (options) => options.next({...options, context: {...options.context, headers: options.request.headers}}),
    ],
  }
}
