import {makeRpcClient, type RpcClient} from '@conciv/contract'

export {makeRpcClient, type RpcClient}

export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve(id ? {id} : {})
  return sessionId
}
