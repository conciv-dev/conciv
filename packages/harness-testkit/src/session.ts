import {makeBrowserRpcClient, makeRpcClient, type RpcClient} from '@conciv/contract'

export {makeRpcClient, type RpcClient}

export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const client = makeBrowserRpcClient(apiBase)
  try {
    const {sessionId} = await client.rpc.sessions.resolve(id ? {id} : {})
    return sessionId
  } finally {
    client.close()
  }
}
