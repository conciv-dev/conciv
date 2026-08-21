import {implement, ORPCError} from '@orpc/server'
import {contract} from '@conciv/contract'
import {CONCIV_SESSION_HEADER, isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import type {ChatTool} from '@conciv/protocol/chat-types'
import type {EngineStaleness} from '@conciv/contract'
import type {CompositeRpcRouter as CompositeRouterOf} from '@conciv/extension/rpc-mount'
import type {ChatDeps} from '../../chat/runtime.js'
import type {Compactor, Send} from '../../chat/run.js'
import type {OpenSourceFrames, OpenSourceStatus} from '../../editor/open-source.js'
import type {RowScope} from '../../chat/session-rows.js'
import {resolveOrMintRow} from '../../chat/session-rows.js'
import type {CoreRuntime, SessionScope} from '../../runtime/scope-types.js'
import {runWithSession} from '../../runtime/session-context.js'
import type {makeRpcRouter} from './router.js'

export type RpcDeps = {
  chat: ChatDeps
  tools: ChatTool[]
  compactor: Compactor
  send: Send
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
  runtime: CoreRuntime
  rows: RowScope
  staleness: () => EngineStaleness
  askTimeoutMs?: number
}

export const os = implement(contract).$context<RpcContext>()

function headerSessionId(context: RpcContext): SessionId | null {
  const raw = rpcHeader(context, CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `the ${CONCIV_SESSION_HEADER} header carries a malformed session id`,
    })
  }
  return raw
}

export async function callerScope(deps: RpcDeps, context: RpcContext): Promise<SessionScope> {
  const sessionId = await resolveOrMintRow(deps.rows, headerSessionId(context))
  return deps.runtime.forSession(sessionId)
}

export function makeSessionOs(deps: RpcDeps) {
  return os.use(async ({context, next}) => {
    const scope = await callerScope(deps, context)
    return runWithSession(scope, () => next({context: {session: scope}}))
  })
}

export type SessionOs = ReturnType<typeof makeSessionOs>

export type CompositeRpcRouter = CompositeRouterOf<ReturnType<typeof makeRpcRouter>>
