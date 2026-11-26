import {createORPCClient, ORPCError} from '@orpc/client'
import {RPCLink, type RPCLinkOptions} from '@orpc/client/fetch'
import {ValidationError, type ContractRouterClient} from '@orpc/contract'
import {ResponseValidationPlugin} from '@orpc/contract/plugins'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM, CONCIV_VERSION_HEADER} from '@conciv/types/rpc-types'
import {contract} from '@conciv/protocol'
import contractManifest from '../../../protocol/package.json' with {type: 'json'}
import {
  engineUnreachable,
  type EngineConnection,
  type RpcClientContext,
  type SessionAccessor,
} from './engine-connection.js'

export type EngineClient = ContractRouterClient<typeof contract, RpcClientContext>

export type RpcClientOptions = {
  token?: string
  headers?: Record<string, string>
  interceptors?: RPCLinkOptions<RpcClientContext>['interceptors']
}

export function abortableFetch(
  request: Request,
  init: RequestInit,
  options: {signal?: AbortSignal | undefined},
): Promise<Response> {
  return fetch(request, {...init, signal: options.signal ?? null})
}

function rpcUrl(apiBase: string, token: string | undefined): string {
  const url = new URL(`${apiBase}/rpc`)
  if (token !== undefined && token !== '') url.searchParams.set(CONCIV_AUTH_TOKEN_QUERY_PARAM, token)
  return url.href
}

export function makeRpcClient(apiBase: string, options: RpcClientOptions = {}): EngineClient {
  const link = new RPCLink<RpcClientContext>({
    url: rpcUrl(apiBase, options.token),
    fetch: abortableFetch,
    headers: {...options.headers, [CONCIV_VERSION_HEADER]: contractManifest.version},
    interceptors: [...(options.interceptors ?? [])],
    plugins: [new ResponseValidationPlugin(contract)],
  })
  return createORPCClient(link)
}

export function engineTooOld(error: unknown): boolean {
  return error instanceof ValidationError || (error instanceof ORPCError && error.code === 'NOT_FOUND')
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
