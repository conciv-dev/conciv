import {createORPCClient, DynamicLink, type ClientLink} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {ContractRouterClient} from '@orpc/contract'
import {contract} from './contract.js'
import {
  browserRpcConnection,
  closeBrowserRpcConnection,
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

export function makeBrowserRpcClient(apiBase: string, options: BrowserRpcClientOptions = {}): RpcClient {
  return createORPCClient(browserRpcConnection(apiBase, options.transport).link)
}

export type DeferredRpcClient = {rpc: RpcClient; bind: (apiBase: string) => void; bound: () => boolean}

export function makeDeferredRpcClient(options: BrowserRpcClientOptions = {}): DeferredRpcClient {
  const state: {base: string | null; ready: Promise<ClientLink<RpcClientContext>> | null} = {base: null, ready: null}
  const link = new DynamicLink<RpcClientContext>(() => {
    if (!state.ready) throw new Error('conciv core not connected yet')
    return state.ready
  })
  return {
    rpc: createORPCClient(link),
    bind: (apiBase) => {
      if (state.base) throw new Error('deferred rpc already bound')
      state.base = apiBase
      state.ready = Promise.resolve(browserRpcConnection(apiBase, options.transport).link)
    },
    bound: () => state.base !== null,
  }
}

export type RebindableRpcClient = {rpc: RpcClient; rebind: (apiBase: string) => void}

export function makeRebindableRpcClient(apiBase: string, options: BrowserRpcClientOptions = {}): RebindableRpcClient {
  const state = {base: apiBase}
  const link = new DynamicLink<RpcClientContext>(() => browserRpcConnection(state.base, options.transport).link)
  return {
    rpc: createORPCClient(link),
    rebind: (nextApiBase) => {
      if (nextApiBase === state.base) return
      closeBrowserRpcConnection(state.base)
      state.base = nextApiBase
    },
  }
}
