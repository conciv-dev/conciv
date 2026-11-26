import type {Tracer} from '../../../ai.js'
import type * as Identifier from '@conciv/protocol/schema/identifier'
import {implement, ORPCError, os as plainOs, type Implementer} from '@orpc/server'
import {contract} from '@conciv/protocol'
import {z} from 'zod'
import {CONCIV_SESSION_HEADER, isSessionId, SessionId} from '@conciv/types/chat-types'
import {rpcHeader, type RpcContext} from '@conciv/types/rpc-types'
import type {ChatTool} from '@conciv/types/chat-types'
import type {EngineStaleness} from '@conciv/protocol'
import type {ChatPlane} from '../../../backend-defaults.js'
import type {ConcivDb} from '../../../db/connection.js'
import type {ConcivServerTool} from '../../../tools.js'
import type {HarnessAdapter} from '@conciv/harness'
import type {CoreRuntime, SessionScope} from '../../runtime/scope-types.js'
import type {RowScope} from '../../sessions/session-rows.js'
import {hubOrigin} from '../call-trace.js'
import type {AuthRouter} from '../../engine-login.js'
import type {createSessionSearch} from '../../sessions/session-search.js'
import type {createHubInstaller} from './hub.js'
import type {createSettingsStorage} from '../../settings/settings-storage.js'
import type {McpVars} from '../mcp.js'
import type {ProjectDeps} from '../../lib/project.js'
import type {ManagedRuntime} from 'effect'
import type {
  Agent,
  Bus,
  Database,
  InstructionEntry,
  KV,
  Location,
  Permission,
  PermissionSaved,
  Plugin,
  PluginHooks,
  Rpc,
  Session,
  Skill,
  Tool,
} from '@conciv/backend-app-api'
import type {FileSystem, SessionInbox, SkillInstructions} from '../../../backend-defaults.js'
import type {PermissionAnswer} from '../../runtime/permission-cards.js'
import type * as EventFeed from '../../event-feed.js'
import type {PersistentPtys} from '../../pty/persistent-ptys.js'
import type {Log} from '../../lib/logging.js'

export type PluginHost = ManagedRuntime.ManagedRuntime<
  | Tool.Interface
  | Permission.Interface
  | Agent.Interface
  | PermissionSaved.Interface
  | Permission.SessionsInterface
  | PluginHooks.Interface
  | Rpc.Interface
  | KV.Interface
  | InstructionEntry.Interface
  | Skill.Interface
  | SkillInstructions.Interface
  | Bus.Interface
  | Location.Interface
  | Plugin.Interface
  | Database.Interface
  | EventFeed.Interface
  | FileSystem.Interface
  | SessionInbox.Interface
  | Session.Interface
  | Identifier.Maker,
  never
>

export type ChatContext = {
  defaultHarness: HarnessAdapter
  harnesses: readonly HarnessAdapter[]
  harnessFor: (sessionId: SessionId) => Promise<HarnessAdapter>
  cwd: string
  agentToken: string
  db: ConcivDb
  rows: RowScope
  plane: ChatPlane
  signal: AbortSignal
  log: Log
  tracer: Tracer | undefined
}

export type RpcDeps = {
  chat: ChatContext
  tools: (sessionId: SessionId) => Promise<ChatTool[]>
  runtime: CoreRuntime
  allowedOrigins: ReadonlySet<string>
  staleness: () => Promise<EngineStaleness>
  auth: AuthRouter
  admitOutside: (scope: SessionScope, client: string | null, signal: AbortSignal) => Promise<string | null>
  search: ReturnType<typeof createSessionSearch>
  settings: ReturnType<typeof createSettingsStorage>
  hub: ReturnType<typeof createHubInstaller>
  assist: (sessionId: SessionId) => readonly ConcivServerTool[]
  code: McpVars['mcp']
  project: ProjectDeps
  pluginHost: PluginHost
  eventHeartbeatIntervalMs?: number
  answerPermission: PermissionAnswer
  ptys: PersistentPtys
}

export const os: Implementer<typeof contract, RpcContext, RpcContext> = implement(contract).$context<RpcContext>()

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

export function makeSessionOs(deps: RpcDeps): SessionOs {
  return os.use(async ({context, next, signal}) => {
    const scope = callerScope(deps, context)
    await admitHubCaller(deps, context, scope, signal)
    return next({context: {session: scope}})
  })
}

export function makeToolCallOs(deps: RpcDeps): SessionOs {
  return os.use(({context, next}) => {
    const scope = callerScope(deps, context)
    return next({context: {session: scope}})
  })
}

const ADMITTED_INSIDE_THE_TOOL: readonly string[] = ['registry.call']

export async function admitOutsideCall(
  deps: RpcDeps,
  context: RpcContext,
  scope: SessionScope,
  signal: AbortSignal | undefined,
  procedure: string,
): Promise<void> {
  const hub = hubOrigin((header) => rpcHeader(context, header))
  if (hub === null) return
  await refuseOutside(deps, hub.client, procedure)
  await admitHubCaller(deps, context, scope, signal)
}

const DECIDING_PROCEDURES: readonly string[] = ['chat.permissionDecision']

const OUTSIDE_DECISION_REFUSAL = "outside agents can't answer permission requests; decide it in the tab"

const HUB_PROCEDURES: readonly string[] = ['meta.connectHub', 'meta.disconnectHub']

const OUTSIDE_HUB_REFUSAL = "outside agents can't connect or disconnect agents; do it in the tab"

const EVENT_PROCEDURES: readonly string[] = ['event.subscribe', 'chat.join']

const OUTSIDE_EVENT_REFUSAL = "outside agents can't read the engine's event stream"

const PLUGIN_PROCEDURES: readonly string[] = [
  'plugin.call',
  'plugin.list',
  'plugin.experimental',
  'plugin.experimentalChunk',
  'skill.list',
  'agent.list',
  'fs.find',
]

const OUTSIDE_PLUGIN_REFUSAL = "outside agents can't use plugin routes; use the plugin in the tab"

const PTY_PROCEDURES: readonly string[] = [
  'experimental.persistentPty.create',
  'experimental.persistentPty.remove',
  'experimental.persistentPty.output',
  'experimental.persistentPty.write',
  'experimental.persistentPty.resize',
  'experimental.persistentPty.inject',
]

const OUTSIDE_PTY_REFUSAL = "outside agents can't use the session terminal; use it in the tab"

export function makeHubAdmission(deps: RpcDeps) {
  return plainOs.$context<RpcContext>().middleware(async ({context, next, signal, path}, input: unknown) => {
    const hub = hubOrigin((header) => rpcHeader(context, header))
    const procedure = path.join('.')
    if (hub !== null && !ADMITTED_INSIDE_THE_TOOL.includes(procedure)) await refuseOutside(deps, hub.client, procedure)
    const named = NamedSessionSchema.safeParse(input)
    if (named.success) await admitHubCaller(deps, context, deps.runtime.forSession(named.data.sessionId), signal)
    return next()
  })
}

async function refuseOutside(deps: RpcDeps, client: string | null, procedure: string): Promise<void> {
  const disconnected = await deps.hub.refusal(client)
  if (disconnected !== null) throw new ORPCError('APPROVAL_DENIED', {message: disconnected})
  if (DECIDING_PROCEDURES.includes(procedure))
    throw new ORPCError('APPROVAL_DENIED', {message: OUTSIDE_DECISION_REFUSAL})
  if (HUB_PROCEDURES.includes(procedure)) throw new ORPCError('APPROVAL_DENIED', {message: OUTSIDE_HUB_REFUSAL})
  if (EVENT_PROCEDURES.includes(procedure)) throw new ORPCError('APPROVAL_DENIED', {message: OUTSIDE_EVENT_REFUSAL})
  if (PLUGIN_PROCEDURES.includes(procedure)) throw new ORPCError('APPROVAL_DENIED', {message: OUTSIDE_PLUGIN_REFUSAL})
  if (PTY_PROCEDURES.includes(procedure)) throw new ORPCError('APPROVAL_DENIED', {message: OUTSIDE_PTY_REFUSAL})
}

async function admitHubCaller(
  deps: RpcDeps,
  context: RpcContext,
  scope: SessionScope,
  signal: AbortSignal | undefined,
): Promise<void> {
  const hub = hubOrigin((header) => rpcHeader(context, header))
  if (hub === null) return
  const refusal =
    (await deps.admitOutside(scope, hub.client, signal ?? new AbortController().signal)) ??
    (await deps.hub.refusal(hub.client))
  if (refusal !== null) throw new ORPCError('APPROVAL_DENIED', {message: refusal})
}

export type SessionOs = ReturnType<typeof os.use<{session: SessionScope}>>
