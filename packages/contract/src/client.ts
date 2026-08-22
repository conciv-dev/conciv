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
  type SessionAccessor,
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

export type BrowserRpcClientOptions = {transport?: RpcTransportPreference; session?: SessionAccessor}

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
  const link = dynamicBrowserRpcLink(currentBase, options.transport, options.session)
  return {
    rpc: createORPCClient(link),
    bound: () => currentBase() !== null,
    bind: (apiBase) => {
      if (currentBase() !== null) throw new Error('conciv rpc client already bound')
      if (apiBase === '') throw new Error('conciv rpc cannot bind an empty api base')
      state.accessor = () => apiBase
    },
    rebind: (nextApiBase) => {
      const previous = currentBase()
      if (previous !== null) closeBrowserRpcConnection(previous)
      state.accessor = () => nextApiBase
    },
    close: () => {
      const previous = currentBase()
      if (previous === null) return
      closeBrowserRpcConnection(previous)
      state.accessor = () => null
    },
  }
}

export {RPC_UNBOUND_MESSAGE}
