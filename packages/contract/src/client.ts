import {createORPCClient, ORPCError} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {ValidationError, type ContractRouterClient} from '@orpc/contract'
import {ResponseValidationPlugin} from '@orpc/contract/plugins'
import {CONCIV_VERSION_HEADER} from '@conciv/protocol/rpc-types'
import {contract} from './contract.js'
import contractManifest from '../package.json' with {type: 'json'}
import {
  heldBrowserRpcLink,
  RPC_UNBOUND_MESSAGE,
  type RpcClientContext,
  type SessionAccessor,
} from './browser-transport.js'

export type RpcClient = ContractRouterClient<typeof contract, RpcClientContext>

export type RpcClientOptions = {headers?: Record<string, string>; validated?: boolean}

export function abortableFetch(
  request: Request,
  init: RequestInit,
  options: {signal?: AbortSignal | undefined},
): Promise<Response> {
  return fetch(request, {...init, signal: options.signal ?? null})
}

export function makeRpcClient(apiBase: string, options: RpcClientOptions = {}): RpcClient {
  const link = new RPCLink<RpcClientContext>({
    url: `${apiBase}/rpc`,
    fetch: abortableFetch,
    headers: {...options.headers, [CONCIV_VERSION_HEADER]: contractManifest.version},
    plugins: options.validated === true ? [new ResponseValidationPlugin(contract)] : [],
  })
  return createORPCClient(link)
}

export function engineTooOld(error: unknown): boolean {
  return error instanceof ValidationError || (error instanceof ORPCError && error.code === 'NOT_FOUND')
}

export type BrowserRpcClientOptions = {session?: SessionAccessor}

export type BrowserRpcClient = {
  rpc: RpcClient
  bound: () => boolean
  bind: (apiBase: string) => void
  rebind: (apiBase: string) => void
  close: () => void
}

export function makeBrowserRpcClient(
  base: string | (() => string | null),
  options: BrowserRpcClientOptions = {},
): BrowserRpcClient {
  const state: {accessor: () => string | null} = {accessor: typeof base === 'function' ? base : () => base}
  const currentBase = (): string | null => state.accessor()
  const {link, release} = heldBrowserRpcLink(currentBase, options.session)
  return {
    rpc: createORPCClient(link),
    bound: () => currentBase() !== null,
    bind: (apiBase) => {
      if (currentBase() !== null) throw new Error('conciv rpc client already bound')
      if (apiBase === '') throw new Error('conciv rpc cannot bind an empty api base')
      state.accessor = () => apiBase
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
