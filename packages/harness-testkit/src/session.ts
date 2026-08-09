import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {deadline, TESTKIT_DEADLINE_MS} from './deadline.js'

export {makeRpcClient, type RpcClient}

export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const client = makeRpcClient(apiBase)
  const {sessionId} = await deadline(
    'testkit sessions.resolve',
    TESTKIT_DEADLINE_MS,
    client.sessions.resolve(id ? {id} : {}),
  )
  return sessionId
}
