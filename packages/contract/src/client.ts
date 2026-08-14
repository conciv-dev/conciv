import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {ContractRouterClient} from '@orpc/contract'
import {contract} from './contract.js'
import {
  closeBrowserRpcConnection,
  dynamicBrowserRpcLink,
  RPC_UNBOUND_MESSAGE,
  type RpcClientContext,
  type RpcTransportPreference,
} from './browser-transport.js'

export type RpcClient = ContractRouterClient<typeof contract, RpcClientContext>

export type RpcClientOptions = {headers?: Record<string, string>}

export function makeRpcClient(apiBase: string, options: RpcClientOptions = {}): RpcClient {
  const link = new RPCLink<RpcClientContext>({
    url: `${apiBase}/rpc`,
    ...(options.headers ? {headers: options.headers} : {}),
  })
  return createORPCClient(link)
}

export type BrowserRpcClientOptions = {transport?: RpcTransportPreference}

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
  const state: {base: string | null} = {base: typeof base === 'function' ? base() : base}
  const link = dynamicBrowserRpcLink(() => state.base, options.transport)
  return {
    rpc: createORPCClient(link),
    bound: () => state.base !== null,
    bind: (apiBase) => {
      if (state.base !== null) throw new Error('conciv rpc client already bound')
      if (apiBase === '') throw new Error('conciv rpc cannot bind an empty api base')
      state.base = apiBase
    },
    rebind: (nextApiBase) => {
      if (state.base !== null) closeBrowserRpcConnection(state.base)
      state.base = nextApiBase
    },
    close: () => {
      if (state.base !== null) closeBrowserRpcConnection(state.base)
    },
  }
}

export {RPC_UNBOUND_MESSAGE}
