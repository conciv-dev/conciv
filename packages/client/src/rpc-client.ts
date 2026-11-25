import {createORPCClient, ORPCError} from '@orpc/client'
import {RPCLink, type RPCLinkOptions} from '@orpc/client/fetch'
import {ValidationError, type ContractRouterClient} from '@orpc/contract'
import {ResponseValidationPlugin} from '@orpc/contract/plugins'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM, CONCIV_VERSION_HEADER} from '@conciv/types/rpc-types'
import {contract} from '@conciv/protocol'
import contractManifest from '../../protocol/package.json' with {type: 'json'}
import type {EngineConnectionTimings} from './engine-connection-machine.js'
import {
  heldBrowserRpcLink,
  RPC_UNBOUND_MESSAGE,
  type RpcClientContext,
  type SessionAccessor,
} from './browser-transport.js'

export type RpcClient = ContractRouterClient<typeof contract, RpcClientContext>

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

export function makeRpcClient(apiBase: string, options: RpcClientOptions = {}): RpcClient {
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

export type BrowserRpcClientOptions = {
  session?: SessionAccessor
  timings?: Partial<EngineConnectionTimings>
  token?: string
}

export type BrowserRpcClient = {
  rpc: RpcClient
  bound: () => boolean
  bind: (apiBase: string, token?: string) => void
  rebind: (apiBase: string) => void
  close: () => void
}

export function makeBrowserRpcClient(
  base: string | (() => string | null),
  options: BrowserRpcClientOptions = {},
): BrowserRpcClient {
  const state: {accessor: () => string | null; token: string | undefined} = {
    accessor: typeof base === 'function' ? base : () => base,
    token: options.token,
  }
  const currentBase = (): string | null => state.accessor()
  const {link, release} = heldBrowserRpcLink(currentBase, options.session, options.timings, () => state.token)
  return {
    rpc: createORPCClient(link),
    bound: () => currentBase() !== null,
    bind: (apiBase, token) => {
      if (currentBase() !== null) throw new Error('conciv rpc client already bound')
      if (apiBase === '') throw new Error('conciv rpc cannot bind an empty api base')
      state.accessor = () => apiBase
      state.token = token
    },
    rebind: (nextApiBase) => {
      release()
      state.accessor = () => nextApiBase
    },
    close: () => {
      release()
      state.accessor = () => null
    },
  }
}

export {RPC_UNBOUND_MESSAGE}
