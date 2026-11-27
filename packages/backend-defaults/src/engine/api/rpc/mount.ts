import type {Tracer} from '../../../ai.js'
import type * as Identifier from '@conciv/protocol/schema/identifier'
import '@orpc/effect/extensions/effect'
import {middlewareGen, type EffectWrapOptions, type WithEffectContext} from '@orpc/effect'
import {implement, ORPCError, type Implementer} from '@orpc/server'
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
import {Context, Effect, type ManagedRuntime} from 'effect'
import type {AuditableLogger, RequestLogger} from 'evlog'
import {EvlogLogger} from 'evlog/effect'
import type * as Tab from '@conciv/backend-app-api/core/tab'
import type * as Job from '@conciv/backend-app-api/core/job'
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
import type {EngineRuntime} from '../../lib/logging.js'
import type * as LogLevel from '../../../util/observability/log-level.js'
import type * as LogStore from '../../../util/observability/log-store.js'

export type EngineServices =
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
  | Tab.Interface
  | Job.Interface
  | LogLevel.Interface
  | LogStore.Interface
  | Identifier.Maker

export type PluginHost = ManagedRuntime.ManagedRuntime<EngineServices, never>

export type EngineRpcContext = RpcContext & WithEffectContext<EngineServices>

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
  runtime: EngineRuntime
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

export const os: Implementer<typeof contract, EngineRpcContext> = implement(contract).$context<EngineRpcContext>()

const TaggedFailureSchema = z.object({
  _tag: z.enum(['Session.NotFoundError', 'Tab.UnavailableError']),
  message: z.string().optional(),
})

const PluginRpcFailureSchema = z.object({type: z.string(), message: z.string(), data: z.unknown().optional()})

function declaredError(
  options: EffectWrapOptions,
  code: string,
  error: {message?: string; data?: unknown},
): ORPCError<string, unknown> | undefined {
  const declared = options.procedure['~orpc'].errorMap[code]
  if (declared === undefined) return undefined
  return new ORPCError(code, {message: error.message ?? declared.message, data: error.data})
}

function pluginRpcError(options: EffectWrapOptions, failure: unknown): ORPCError<string, unknown> | undefined {
  const parsed = PluginRpcFailureSchema.safeParse(failure)
  if (!parsed.success) return undefined
  const {type, message} = parsed.data
  if (type === 'rpc.internal' || type === 'rpc.invalid_output')
    return declaredError(options, 'PLUGIN_RPC_INTERNAL', {message, data: {type, message}})
  return declaredError(options, 'PLUGIN_RPC', {message, data: failure})
}

function engineError(options: EffectWrapOptions, failure: unknown): unknown {
  if (failure instanceof ORPCError) return failure
  const tagged = TaggedFailureSchema.safeParse(failure)
  if (!tagged.success) return pluginRpcError(options, failure) ?? failure
  if (tagged.data._tag === 'Session.NotFoundError') return declaredError(options, 'NOT_FOUND', {}) ?? failure
  return declaredError(options, 'UNAVAILABLE', {message: tagged.data.message}) ?? failure
}

function wrapEngineEffect<A>(effect: Effect.Effect<A, unknown>, options: EffectWrapOptions): Effect.Effect<A, unknown> {
  return effect.pipe(Effect.mapError((failure) => engineError(options, failure)))
}

function isAuditable(logger: RequestLogger): logger is AuditableLogger {
  return typeof Reflect.get(logger, 'audit') === 'function'
}

export function makeCallContext(
  host: PluginHost,
): (logger: RequestLogger | undefined) => Promise<WithEffectContext<EngineServices>> {
  return async (logger) => {
    const services = await host.context()
    const call = logger !== undefined && isAuditable(logger) ? Context.add(services, EvlogLogger, logger) : services
    return {'effect/context': call, 'effect/wrap': wrapEngineEffect}
  }
}

function headerSessionId(context: RpcContext): Effect.Effect<SessionId | null, ORPCError<'BAD_REQUEST', unknown>> {
  const raw = rpcHeader(context, CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return Effect.succeed(null)
  if (isSessionId(raw)) return Effect.succeed(raw)
  return Effect.fail(
    new ORPCError('BAD_REQUEST', {
      message: `the ${CONCIV_SESSION_HEADER} header carries a malformed session id`,
    }),
  )
}

export function callerScope(
  deps: RpcDeps,
  context: RpcContext,
): Effect.Effect<SessionScope, ORPCError<'BAD_REQUEST', unknown>> {
  return headerSessionId(context).pipe(
    Effect.flatMap((sessionId) =>
      sessionId === null
        ? Effect.fail(
            new ORPCError('BAD_REQUEST', {
              message: `this procedure acts on behalf of one session and the caller sent no ${CONCIV_SESSION_HEADER} header; resolve a session with sessions.resolve and send it on every call`,
            }),
          )
        : Effect.succeed(deps.runtime.forSession(sessionId)),
    ),
  )
}

const NamedSessionSchema = z.object({sessionId: SessionId})

export function makeSessionOs(deps: RpcDeps): SessionOs {
  return os.use(
    middlewareGen(function* ({context, next}) {
      const scope = yield* callerScope(deps, context)
      yield* admitHubCaller(deps, context, scope)
      return yield* next({context: {session: scope}})
    }),
  )
}

export function makeToolCallOs(deps: RpcDeps): SessionOs {
  return os.use(
    middlewareGen(function* ({context, next}) {
      const scope = yield* callerScope(deps, context)
      return yield* next({context: {session: scope}})
    }),
  )
}

const ADMITTED_INSIDE_THE_TOOL: readonly string[] = ['registry.call']

export function admitOutsideCall(
  deps: RpcDeps,
  context: RpcContext,
  scope: SessionScope,
  procedure: string,
): Effect.Effect<void, ORPCError<'APPROVAL_DENIED', unknown>> {
  const hub = hubOrigin((header) => rpcHeader(context, header))
  if (hub === null) return Effect.void
  return refuseOutside(deps, hub.client, procedure).pipe(Effect.andThen(admitHubCaller(deps, context, scope)))
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

const WIDGET_LOG_PROCEDURES: readonly string[] = ['logs.write']

const OUTSIDE_WIDGET_LOG_REFUSAL = "outside agents can't write the widget's logs"

export function makeHubAdmission(deps: RpcDeps) {
  return middlewareGen<EngineRpcContext>(function* ({context, next, path}, input) {
    const hub = hubOrigin((header) => rpcHeader(context, header))
    const procedure = path.join('.')
    if (hub !== null && !ADMITTED_INSIDE_THE_TOOL.includes(procedure)) yield* refuseOutside(deps, hub.client, procedure)
    const named = NamedSessionSchema.safeParse(input)
    if (named.success) yield* admitHubCaller(deps, context, deps.runtime.forSession(named.data.sessionId))
    return yield* next()
  })
}

function approvalDenied(message: string): Effect.Effect<never, ORPCError<'APPROVAL_DENIED', unknown>> {
  return Effect.fail(new ORPCError('APPROVAL_DENIED', {message}))
}

function outsideRefusal(procedure: string): string | null {
  if (DECIDING_PROCEDURES.includes(procedure)) return OUTSIDE_DECISION_REFUSAL
  if (HUB_PROCEDURES.includes(procedure)) return OUTSIDE_HUB_REFUSAL
  if (EVENT_PROCEDURES.includes(procedure)) return OUTSIDE_EVENT_REFUSAL
  if (PLUGIN_PROCEDURES.includes(procedure)) return OUTSIDE_PLUGIN_REFUSAL
  if (PTY_PROCEDURES.includes(procedure)) return OUTSIDE_PTY_REFUSAL
  if (WIDGET_LOG_PROCEDURES.includes(procedure)) return OUTSIDE_WIDGET_LOG_REFUSAL
  return null
}

function refuseOutside(
  deps: RpcDeps,
  client: string | null,
  procedure: string,
): Effect.Effect<void, ORPCError<'APPROVAL_DENIED', unknown>> {
  return Effect.gen(function* () {
    const disconnected = yield* Effect.promise(() => deps.hub.refusal(client))
    if (disconnected !== null) return yield* approvalDenied(disconnected)
    const refused = outsideRefusal(procedure)
    if (refused !== null) return yield* approvalDenied(refused)
  })
}

function admitHubCaller(
  deps: RpcDeps,
  context: RpcContext,
  scope: SessionScope,
): Effect.Effect<void, ORPCError<'APPROVAL_DENIED', unknown>> {
  const hub = hubOrigin((header) => rpcHeader(context, header))
  if (hub === null) return Effect.void
  return Effect.gen(function* () {
    const refusal =
      (yield* Effect.promise((signal) => deps.admitOutside(scope, hub.client, signal))) ??
      (yield* Effect.promise(() => deps.hub.refusal(hub.client)))
    if (refusal !== null) return yield* approvalDenied(refusal)
  })
}

export type SessionOs = ReturnType<typeof os.use<{session: SessionScope}>>
