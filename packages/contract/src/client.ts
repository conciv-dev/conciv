import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {ContractRouterClient} from '@orpc/contract'
import {contract} from './contract.js'

export type RpcClient = ContractRouterClient<typeof contract>

export function makeRpcClient(apiBase: string): RpcClient {
  const link = new RPCLink({url: `${apiBase}/rpc`})
  return createORPCClient(link)
}
