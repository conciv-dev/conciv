import {createORPCClient, ORPCError} from '@orpc/client'
import {RPCLink, type RPCLinkOptions} from '@orpc/client/fetch'
import {ValidationError, type RouterContractClient} from '@orpc/contract'
import {ResponseValidationLinkPlugin} from '@orpc/contract/plugins'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM, CONCIV_VERSION_HEADER} from '@conciv/types/rpc-types'
import {contract} from '@conciv/protocol'
import contractManifest from '../../../protocol/package.json' with {type: 'json'}
import {
  engineUnreachable,
  type EngineConnection,
  type RpcClientContext,
  type SessionAccessor,
} from './engine-connection.js'

export type EngineClient = RouterContractClient<typeof contract, RpcClientContext>

export type RpcClientOptions = {
  token?: string
  headers?: Record<string, string>
  interceptors?: RPCLinkOptions<RpcClientContext>['interceptors']
}

export function makeRpcClient(apiBase: string, options: RpcClientOptions = {}): EngineClient {
  const target = new URL(`${apiBase}/rpc`)
  if (options.token !== undefined && options.token !== '')
    target.searchParams.set(CONCIV_AUTH_TOKEN_QUERY_PARAM, options.token)
  const link = new RPCLink<RpcClientContext>({
    origin: target.origin,
    url: `/${target.pathname.slice(1)}${target.search}`,
    headers: {...options.headers, [CONCIV_VERSION_HEADER]: contractManifest.version},
    interceptors: [...(options.interceptors ?? [])],
    plugins: [new ResponseValidationLinkPlugin(contract)],
  })
  return createORPCClient(link)
}

export function engineTooOld(error: unknown): boolean {
  if (!(error instanceof ORPCError)) return false
  return error.cause instanceof ValidationError || error.code === 'NOT_FOUND'
}

export const RPC_UNBOUND_MESSAGE = 'conciv core not connected yet'

export function makeEngineRpcClient(
  connection: () => EngineConnection | undefined,
  session?: SessionAccessor,
): EngineClient {
  return createORPCClient<EngineClient>({
    call: (path, input, options) => {
      const current = connection()
      if (current === undefined) throw engineUnreachable(RPC_UNBOUND_MESSAGE)
      const sessionId = session?.()
      const context = sessionId ? {...options.context, concivSessionId: sessionId} : options.context
      return current.link.call(path, input, {...options, context})
    },
  })
}
