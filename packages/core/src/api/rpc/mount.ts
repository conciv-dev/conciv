import {implement, ORPCError} from '@orpc/server'
import {contract} from '@conciv/contract'
import {CONCIV_SESSION_HEADER, isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import type {ChatTool} from '@conciv/protocol/chat-types'
import type {EngineStaleness} from '@conciv/contract'
import type {CompositeRpcRouter as CompositeRouterOf} from '@conciv/extension/rpc-mount'
import type {ChatDeps} from '../../chat/runtime.js'
import type {OpenSourceFrames, OpenSourceStatus} from '../../editor/open-source.js'
import type {CoreRuntime, SessionScope} from '../../runtime/scope-types.js'
import type {SettingsService} from '../../settings/service.js'
import {runWithSession} from '../../runtime/session-context.js'
import type {makeRpcRouter} from './router.js'

export type RpcDeps = {
  chat: ChatDeps
  tools: ChatTool[]
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
  runtime: CoreRuntime
  settings: SettingsService
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

export function callerScope(deps: RpcDeps, context: RpcContext): SessionScope {
  const sessionId = headerSessionId(context)
  if (sessionId === null) {
    throw new ORPCError('UNAUTHORIZED', {
      message: `this procedure acts on behalf of one session and the caller sent no ${CONCIV_SESSION_HEADER} header; resolve a session with sessions.resolve and send it on every call`,
    })
  }
  return deps.runtime.forSession(sessionId)
}

export function makeSessionOs(deps: RpcDeps) {
  return os.use(({context, next}) => {
    const scope = callerScope(deps, context)
    return runWithSession(scope, () => next({context: {session: scope}}))
  })
}

export type SessionOs = ReturnType<typeof makeSessionOs>

export type CompositeRpcRouter = CompositeRouterOf<ReturnType<typeof makeRpcRouter>>
