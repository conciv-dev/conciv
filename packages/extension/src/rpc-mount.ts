import type {StandardRPCHandlerOptions} from '@orpc/server/standard'
import type {RpcContext} from '@conciv/protocol/rpc-types'

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
