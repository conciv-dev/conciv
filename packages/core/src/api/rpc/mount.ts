import {implement, ORPCError, os as plainOs} from '@orpc/server'
import {contract} from '@conciv/contract'
import {z} from 'zod'
import {CONCIV_SESSION_HEADER, isSessionId, SessionId} from '@conciv/protocol/chat-types'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import type {ChatTool} from '@conciv/protocol/chat-types'
import type {EngineStaleness} from '@conciv/contract'
import type {CompositeRpcRouter as CompositeRouterOf} from '@conciv/extension/rpc-mount'
import type {ChatPlane} from '@conciv/chat'
import type {ConcivDb} from '@conciv/db'
import type {HarnessAdapter} from '@conciv/harness'
import type {OpenSourceFrames, OpenSourceStatus} from '../../editor/open-source.js'
import type {CoreRuntime, SessionScope} from '../../runtime/scope-types.js'
import {runWithSession} from '../../runtime/session-context.js'
import {callTrace} from '../call-trace.js'
import type {makeRpcRouter} from './router.js'
import type {AuthRouter} from '../../engine-login.js'
import type {createSessionSearch} from '../../sessions/session-search.js'
import type {createHubInstaller} from './hub.js'

export type ChatContext = {
  defaultHarness: HarnessAdapter
  harnesses: readonly HarnessAdapter[]
  harnessFor: (sessionId: SessionId) => HarnessAdapter
  cwd: string
  basePath: string
  db: ConcivDb
  plane: ChatPlane
}

export type RpcDeps = {
  chat: ChatContext
  tools: ChatTool[]
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
  runtime: CoreRuntime
  allowedOrigins: ReadonlySet<string>
  staleness: () => EngineStaleness
  auth: AuthRouter
  admitOutside: (scope: SessionScope, client: string | null, signal: AbortSignal) => Promise<string | null>
  search: ReturnType<typeof createSessionSearch>
  hub: ReturnType<typeof createHubInstaller>
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
    throw new ORPCError('BAD_REQUEST', {
      message: `this procedure acts on behalf of one session and the caller sent no ${CONCIV_SESSION_HEADER} header; resolve a session with sessions.resolve and send it on every call`,
    })
  }
  return deps.runtime.forSession(sessionId)
}

const NamedSessionSchema = z.object({sessionId: SessionId})

export function makeSessionOs(deps: RpcDeps) {
  return os.use(async ({context, next, signal}) => {
    const scope = callerScope(deps, context)
    await admitHubCaller(deps, context, scope, signal)
    return runWithSession(scope, () => next({context: {session: scope}}))
  })
}

const DECIDING_PROCEDURES = new Set(['chat.permissionDecision', 'chat.allowOutside'])

const OUTSIDE_DECISION_REFUSAL = "outside agents can't answer permission requests; decide it in the tab"

const HUB_PROCEDURES = new Set(['meta.connectHub', 'meta.disconnectHub'])

const OUTSIDE_HUB_REFUSAL = "outside agents can't connect or disconnect agents; do it in the tab"

export function makeHubAdmission(deps: RpcDeps) {
  return plainOs.$context<RpcContext>().middleware(async ({context, next, signal, path}, input: unknown) => {
    const hub = callTrace((header) => rpcHeader(context, header)).hub
    if (hub !== null) refuseOutside(deps, hub.client, path.join('.'))
    const named = NamedSessionSchema.safeParse(input)
    if (named.success) await admitHubCaller(deps, context, deps.runtime.forSession(named.data.sessionId), signal)
    return next()
  })
}

function refuseOutside(deps: RpcDeps, client: string | null, procedure: string): void {
  const disconnected = deps.hub.refusal(client)
  if (disconnected !== null) throw new ORPCError('APPROVAL_DENIED', {message: disconnected})
  if (DECIDING_PROCEDURES.has(procedure)) throw new ORPCError('APPROVAL_DENIED', {message: OUTSIDE_DECISION_REFUSAL})
  if (HUB_PROCEDURES.has(procedure)) throw new ORPCError('APPROVAL_DENIED', {message: OUTSIDE_HUB_REFUSAL})
}

async function admitHubCaller(
  deps: RpcDeps,
  context: RpcContext,
  scope: SessionScope,
  signal: AbortSignal | undefined,
): Promise<void> {
  const hub = callTrace((header) => rpcHeader(context, header)).hub
  if (hub === null) return
  const refusal = await deps.admitOutside(scope, hub.client, signal ?? new AbortController().signal)
  if (refusal !== null) throw new ORPCError('APPROVAL_DENIED', {message: refusal})
}

export type SessionOs = ReturnType<typeof makeSessionOs>

export type CompositeRpcRouter = CompositeRouterOf<ReturnType<typeof makeRpcRouter>>
