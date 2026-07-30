import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {ContractRouterClient} from '@orpc/contract'
import {contract} from './contract.js'

export type RpcClient = ContractRouterClient<typeof contract>

export function makeRpcClient(apiBase: string): RpcClient {
  const link = new RPCLink({url: `${apiBase}/rpc`})
  return createORPCClient(link)
}

export type DeferredRpcClient = {rpc: RpcClient; bind: (apiBase: string) => void; bound: () => boolean}

export function makeDeferredRpcClient(): DeferredRpcClient {
  let base: string | null = null
  const link = new RPCLink({
    url: () => {
      if (!base) throw new Error('conciv core not connected yet')
      return `${base}/rpc`
    },
  })
  return {
    rpc: createORPCClient(link),
    bind: (apiBase) => {
      if (base) throw new Error('deferred rpc already bound')
      base = apiBase
    },
    bound: () => base !== null,
  }
}

export type RebindableRpcClient = {rpc: RpcClient; rebind: (apiBase: string) => void}

export function makeRebindableRpcClient(apiBase: string): RebindableRpcClient {
  let base = apiBase
  const link = new RPCLink({url: () => `${base}/rpc`})
  return {
    rpc: createORPCClient(link),
    rebind: (nextApiBase) => {
      base = nextApiBase
    },
  }
}
