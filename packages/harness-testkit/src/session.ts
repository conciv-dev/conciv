import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {makeRpcClient, type RpcClient, type RpcClientContext} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

export {makeRpcClient, type RpcClient}

export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve(id ? {id} : {})
  return sessionId
}

export function makeSessionBoundRpcClient(apiBase: string, activeSessionId: () => string): RpcClient {
  const link = new RPCLink<RpcClientContext>({
    url: `${apiBase}/rpc`,
    headers: () => (activeSessionId() ? {[CONCIV_SESSION_HEADER]: activeSessionId()} : {}),
  })
  return createORPCClient<RpcClient>(link)
}
