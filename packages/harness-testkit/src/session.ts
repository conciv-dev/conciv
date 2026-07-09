import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {ContractRouterClient} from '@orpc/contract'
import {contract} from '@conciv/contract'

export type RpcClient = ContractRouterClient<typeof contract>

export function makeRpcClient(apiBase: string): RpcClient {
  const link = new RPCLink({url: `${apiBase}/rpc`})
  return createORPCClient(link)
}

export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve(id ? {id} : {})
  return sessionId
}
