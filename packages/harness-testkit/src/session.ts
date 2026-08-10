import pTimeout from 'p-timeout'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {TESTKIT_DEADLINE_MS} from './deadline.js'

export {makeRpcClient, type RpcClient}

export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const client = makeRpcClient(apiBase)
  const {sessionId} = await pTimeout(client.sessions.resolve(id ? {id} : {}), {
    milliseconds: TESTKIT_DEADLINE_MS,
    message: `testkit sessions.resolve exceeded ${TESTKIT_DEADLINE_MS}ms`,
  })
  return sessionId
}
