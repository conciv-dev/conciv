import {z} from 'zod'
import type {Maker} from '@conciv/protocol/schema/identifier'
import {ORPCError, withEventMeta, type ContractedRouter} from '@orpc/server'
import {asc, eq, sql} from 'drizzle-orm'
import {isToolError} from '@conciv/types/tool-call-types'
import type {HarnessAdapter} from '@conciv/harness'
import {drafts, markers} from '../../../db/schema.js'
import {Cause, Effect, Option, Result, Schema, Stream, Queue} from 'effect'
import type {TtySession} from '../../pty/pty-sessions.js'
import {Agent, Event, Location, Permission, Plugin, Rpc, Skill, Tool} from '@conciv/backend-app-api'
import {FileSystem} from '../../../backend-defaults.js'
import {approvalDenied} from '../../../ai.js'
import * as EventFeed from '../../event-feed.js'
import {
  cappedText,
  PluginExperimentalBundleSchema,
  PluginExperimentalChunksSchema,
  safeStringify,
  type contract,
  type RegistryCallErrorName,
} from '@conciv/protocol'
import {widgetCaller} from '../../lib/cors.js'
import {engineMcpUrl} from '../../engine-login.js'
import {rowById} from '../../sessions/session-rows.js'
import {buildHarnessMenuEntry, buildHarnessMeta, sessionsRouter} from './sessions.js'
import {relayEvents} from './relay-events.js'
import {tabsRouter} from './tabs.js'
import {jobsRouter} from './jobs.js'
import {readProject} from '../../lib/project.js'
import {
  admitOutsideCall,
  makeHubAdmission,
  makeSessionOs,
  makeToolCallOs,
  os,
  type EngineRpcContext,
  type RpcDeps,
  type SessionOs,
} from './mount.js'
import type {SessionScope} from '../../runtime/scope-types.js'
import {rpcHeader, type RpcContext} from '@conciv/types/rpc-types'
import {callTrace} from '../call-trace.js'
import {openCodeSession, type CodeSandboxSession} from '../mcp.js'
import {callPluginTool, pluginSignature, pluginSignatures} from '../../runtime/plugin-signatures.js'
import {settlingAsks, decidePermissionCard} from '../../runtime/permission-cards.js'
import type {SessionId, ChatCommand, ChatCommands} from '@conciv/types/chat-types'
import type {TtyServerControl} from '@conciv/types/terminal-types'

function chatRouter(deps: RpcDeps, sessionOs: SessionOs): ContractedRouter<typeof contract.chat, EngineRpcContext> {
  return {
    events: os.chat.events.effect(function* ({input, signal}) {
      return yield* Effect.sync(() =>
        deps.runtime.forSession(input.sessionId).stream.events(signal ?? new AbortController().signal),
      )
    }),
    send: os.chat.send.effect(function* ({input, signal, lastEventId}) {
      return yield* Effect.sync(() =>
        deps.chat.plane.send(
          {threadId: input.sessionId, runId: input.runId, messages: input.messages, lastEventId},
          signal,
        ),
      )
    }),
    join: os.chat.join.effect(function* ({input, signal, lastEventId}) {
      return yield* Effect.sync(() =>
        deps.chat.plane.join({runId: input.runId, lastEventId: lastEventId ?? input.lastEventId}, signal),
      )
    }),
    hydrate: os.chat.hydrate.effect(function* ({input}) {
      return yield* Effect.promise(() =>
        deps.runtime.forSession(input.sessionId).history.hydrate({limit: input.limit, before: input.before}),
      )
    }),
    stop: os.chat.stop.effect(function* ({input}) {
      yield* Effect.promise(() => deps.runtime.forSession(input.sessionId).run.stop(input.runIds))
      return {ok: true}
    }),
    permissionDecision: sessionOs.chat.permissionDecision.effect(function* ({input, context, errors}) {
      const decided = yield* Effect.promise(() =>
        decidePermissionCard(
          {
            answer: deps.answerPermission,
            publish: (sessionId, chunk) => deps.runtime.forSession(sessionId).stream.publish(chunk),
          },
          context.session.id,
          input,
        ),
      )
      if (!decided) return yield* Effect.fail(errors.UNKNOWN_REQUEST())
      return {ok: true as const}
    }),
    uiReply: os.chat.uiReply.effect(function* ({input, errors}) {
      const answered = yield* Effect.sync(() =>
        deps.chat.plane.answerUi(input.sessionId, input.toolCallId, input.value),
      )
      if (!answered) return yield* Effect.fail(errors.UNKNOWN_REQUEST())
      return {ok: true as const}
    }),
  }
}

type CommandSource = {
  harnessFor: (sessionId: SessionId) => Promise<HarnessAdapter>
  cwd: string
  agentToken: string
}

function commandSource(name: string): ChatCommand['source'] {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.includes(':')) return 'plugin'
  return 'harness'
}

async function listCommands(deps: CommandSource, opts: {sessionId: SessionId; origin: string}): Promise<ChatCommands> {
  const harness = await deps.harnessFor(opts.sessionId)
  const commands = harness.commands
  if (!commands) return {commands: []}
  const mcpUrl = harness.capabilities.mcp === 'http' ? engineMcpUrl(opts.origin, deps.agentToken) : undefined
  const list = await commands({cwd: deps.cwd, sessionId: opts.sessionId, mcpUrl})
  return {
    commands: list.map((command) => ({
      name: command.name,
      description: command.description ?? '',
      ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
      source: commandSource(command.name),
    })),
  }
}

const OUTPUT_CAPACITY = 1024

type PtyOutputItem = {type: 'output'; data: string} | {type: 'meta'; cursor: number} | TtyServerControl

type PtyOutputEvent = {item: PtyOutputItem; cursor: number | null}

type PtyOutputOptions<Failure> = {cursor?: number; capacity?: number; overflow: () => Failure}

export function ptyOutput<Failure>(
  session: TtySession,
  options: PtyOutputOptions<Failure>,
): Stream.Stream<PtyOutputEvent, Failure> {
  const subscribe = Effect.fn('core.pty.subscribe')(function* () {
    const queue = yield* Queue.dropping<PtyOutputEvent, Failure>(options.capacity ?? OUTPUT_CAPACITY)
    const offer = (event: PtyOutputEvent): void => {
      if (!Queue.offerUnsafe(queue, event)) Queue.failCauseUnsafe(queue, Cause.fail(options.overflow()))
    }
    const detach = session.attach(
      {
        data: (data, end) => offer({item: {type: 'output', data}, cursor: end}),
        control: (frame) => offer({item: frame, cursor: null}),
      },
      options.cursor,
    )
    const cursor = session.cursor()
    offer({item: {type: 'meta', cursor}, cursor})
    return {queue, detach}
  })
  return Stream.unwrap(
    Effect.acquireRelease(subscribe(), ({queue, detach}) =>
      Effect.sync(detach).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
    ).pipe(Effect.map(({queue}) => Stream.fromQueue(queue))),
  )
}

type RegistryErrors = Record<RegistryCallErrorName, (options: {message: string; cause: unknown}) => Error>
type ApprovalErrors = {APPROVAL_DENIED: (options: {message: string}) => Error}
type SessionContext = RpcContext & {session: SessionScope}

function registryCallError(error: unknown, errors: RegistryErrors): Error {
  if (isToolError(error)) return new ORPCError(error.code, {message: error.message, data: error.data, cause: error})
  if (error instanceof ORPCError) return error
  return errors.HANDLER_ERROR({message: error instanceof Error ? error.message : String(error), cause: error})
}

const isDeclined = Schema.is(Permission.DeclinedError)
const isBlocked = Schema.is(Permission.BlockedError)
const isCorrected = Schema.is(Permission.CorrectedError)

function pluginToolError(name: string, cause: Cause.Cause<Tool.Error>, errors: RegistryErrors & ApprovalErrors): Error {
  const defect = Cause.findDefect(cause)
  if (Result.isSuccess(defect) && isDeclined(defect.success)) {
    return errors.APPROVAL_DENIED({message: approvalDenied(name).message})
  }
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure)) return registryCallError(Cause.squash(cause), errors)
  const refused = failure.value.error
  if (isBlocked(refused) || isCorrected(refused)) return errors.APPROVAL_DENIED({message: failure.value.message})
  return registryCallError(failure.value, errors)
}

function requireLiveSession(deps: RpcDeps, sessionId: SessionId, errors: ApprovalErrors): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const row = yield* Effect.promise(() => rowById(deps.chat.db, sessionId))
    if (row !== null && row.deletedAt === null) return
    return yield* Effect.fail(errors.APPROVAL_DENIED({message: `session "${sessionId}" does not exist`}))
  })
}

function runPluginTool(
  deps: RpcDeps,
  call: {sessionId: SessionId; name: string; input: unknown; callId: string; widget: boolean},
  errors: RegistryErrors & ApprovalErrors,
) {
  return Effect.gen(function* () {
    if (!call.widget) yield* requireLiveSession(deps, call.sessionId, errors)
    const result = yield* settlingAsks(
      call.sessionId,
      callPluginTool(call.sessionId, call.name, call.input, {id: call.callId, widget: call.widget}),
      (sessionId, chunk) => deps.runtime.forSession(sessionId).stream.publish(chunk),
    ).pipe(Effect.catchCause((cause) => Effect.fail(pluginToolError(call.name, cause, errors))))
    return registryAnswer(result)
  })
}

function registryAnswer(result: Tool.NormalizedResult): unknown {
  if (!result.content.some((part) => part.type === 'file')) return result.output
  const [first, ...rest] = result.content
  return (first?.type === 'text' ? [...rest, first] : result.content).map(contentPart)
}

function contentPart(part: Tool.Content) {
  if (part.type === 'text') return {type: 'text', content: part.text}
  if (!part.mime.startsWith('image/')) return part
  const value = part.uri.slice(part.uri.indexOf(',') + 1)
  return {type: 'image', source: {type: 'data', value, mimeType: part.mime}}
}

function hubTraced<Value, Failure, Services>(
  deps: RpcDeps,
  context: SessionContext,
  call: {name: string; input: unknown; trace: ReturnType<typeof callTrace>},
  run: Effect.Effect<Value, Failure, Services>,
): Effect.Effect<Value, Failure, Services> {
  const {name, input, trace} = call
  if (trace.hub === null) return run
  return Effect.gen(function* () {
    const scope = context.session
    const mirrored = {threadId: scope.id, live: yield* Effect.promise(() => scope.run.live())}
    const mirror = trace.mirror(mirrored, {
      publish: scope.stream.publish,
      record: scope.run.record,
      driving: () => deps.code.driving(scope.id),
      log: deps.code.log,
    })
    const finish = (text: string, failed: boolean) =>
      Effect.promise(() => {
        void mirror.publish(trace.result(mirrored, text, failed))
        return mirror.settle()
      })
    yield* Effect.promise(() => mirror.publish(trace.start(mirrored, name, input)))
    return yield* run.pipe(
      Effect.tap((value) => finish(cappedText(safeStringify(value)), false)),
      Effect.tapCause((cause) => finish(String(Cause.squash(cause)), true)),
    )
  })
}

type CodeErrors = {NO_CODE_MODE: (options?: {message: string}) => Error}

type CodeCall = {context: RpcContext; errors: CodeErrors; signal: AbortSignal}

async function resolveCodeSession(
  deps: RpcDeps,
  sessionId: SessionId | undefined,
  call: CodeCall,
): Promise<CodeSandboxSession> {
  const trace = callTrace((header) => rpcHeader(call.context, header), deps.code.ids)
  const scope =
    sessionId === undefined ? await deps.code.resolveSession(null, null) : deps.runtime.forSession(sessionId)
  const code = await openCodeSession(deps.code, scope, {
    trace,
    outside: trace.hub !== null && sessionId === undefined,
    signal: call.signal,
  })
  if (code === null || code.sandbox === null) throw call.errors.NO_CODE_MODE()
  return code.sandbox
}

function eventStream(
  heartbeatIntervalMs: number | undefined,
  types: ReadonlyArray<string> | undefined,
  signal: AbortSignal | undefined,
  ids: Maker,
) {
  return Effect.gen(function* () {
    const feed = yield* EventFeed.Service
    const connected = {id: Event.Id.create(ids), type: 'server.connected', data: {}}
    const output = Stream.unwrap(
      feed.subscribe(types).pipe(Effect.map((live) => Stream.make(connected).pipe(Stream.concat(live)))),
    )
    const heartbeat = Stream.tick(heartbeatIntervalMs ?? 15_000).pipe(
      Stream.drop(1),
      Stream.map(() => ({id: Event.Id.create(ids), type: 'server.heartbeat', data: {}})),
    )
    const events = yield* Stream.toAsyncIterableEffect(output.pipe(Stream.merge(heartbeat, {haltStrategy: 'left'})))
    return relayEvents(events[Symbol.asyncIterator](), signal)
  })
}

const PtyResumeCursor = z.coerce.number().int().nonnegative()

const ESCAPE_KEY = String.fromCharCode(27)

function writeToPty(pty: TtySession, data: string): void {
  if (data === ESCAPE_KEY && pty.busy()) {
    pty.interrupt()
    return
  }
  pty.write(data)
}

async function* ptyEvents(events: AsyncIterable<PtyOutputEvent>) {
  for await (const event of events) {
    yield event.cursor === null ? event.item : withEventMeta(event.item, {id: String(event.cursor)})
  }
}

function locationResponse<Data, Failure, Services>(data: Effect.Effect<Data, Failure, Services>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    return {location: {directory: location.directory}, data: yield* data}
  }).pipe(Effect.withSpan('core.rpc.locationResponse'))
}

function pluginExperimental(id: string) {
  return Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const bundle = yield* plugins.experimental(Plugin.Id.make(id))
    if (!bundle) return undefined
    return yield* locationResponse(Effect.succeed(PluginExperimentalBundleSchema.parse(bundle)))
  }).pipe(Effect.result)
}

function pluginExperimentalChunk(input: {id: string; file: string}) {
  return Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const chunks = yield* plugins.experimentalChunk(Plugin.Id.make(input.id), input.file)
    if (!chunks) return undefined
    return yield* locationResponse(Effect.succeed(PluginExperimentalChunksSchema.parse(chunks)))
  }).pipe(Effect.result)
}

function missingChunk(pluginId: string, file: string) {
  return {message: `No chunk ${file} in the current build of the plugin ${pluginId}`, data: {pluginId, file}}
}

function missingPlugin(pluginId: string) {
  const message = `No active plugin with a ./plugin-experimental bundle: ${pluginId}`
  return {message, data: {pluginId, message}}
}

function pluginCall(input: {rpcId: string; method: string; input?: unknown}) {
  return Plugin.awaitActivation.pipe(
    Effect.andThen(Rpc.Service.use((rpc) => rpc.call(input.rpcId, input.method, input.input))),
    Effect.catchDefect((defect) =>
      Effect.logError('rpc call failed', {rpc: input.rpcId, method: input.method, defect}).pipe(
        Effect.andThen(Effect.fail({type: 'rpc.internal', message: 'RPC call failed'})),
      ),
    ),
  )
}

function missingPluginOutcome<Success>(
  outcome: Result.Result<Success | undefined, {file: string}>,
  id: string,
  errors: {
    PLUGIN_CHUNK_NOT_FOUND: (options: ReturnType<typeof missingChunk>) => Error
    PLUGIN_NOT_FOUND: (options: ReturnType<typeof missingPlugin>) => Error
  },
): Effect.Effect<Success, Error> {
  if (Result.isFailure(outcome))
    return Effect.fail(errors.PLUGIN_CHUNK_NOT_FOUND(missingChunk(id, outcome.failure.file)))
  if (outcome.success !== undefined) return Effect.succeed(outcome.success)
  return Effect.fail(errors.PLUGIN_NOT_FOUND(missingPlugin(id)))
}

export function makeRpcRouter(deps: RpcDeps): ContractedRouter<typeof contract, EngineRpcContext> {
  const chat = deps.chat
  const db = chat.db
  const engine = deps.runtime.engine
  const sessionOs = makeSessionOs(deps)
  const toolCallOs = makeToolCallOs(deps)
  return os.use(makeHubAdmission(deps)).router({
    auth: deps.auth,
    sessions: sessionsRouter(deps),
    tabs: tabsRouter(),
    jobs: jobsRouter(),
    chat: chatRouter(deps, sessionOs),
    settings: {
      all: os.settings.all.effect(function* ({input}) {
        const file = yield* Effect.promise(() => deps.settings.file(input.scope, input.namespace))
        return yield* Effect.promise(() => file.read())
      }),
      set: os.settings.set.effect(function* ({input}) {
        const file = yield* Effect.promise(() => deps.settings.file(input.scope, input.namespace))
        return yield* Effect.promise(() => file.set(input.key, input.value))
      }),
      delete: os.settings.delete.effect(function* ({input}) {
        const file = yield* Effect.promise(() => deps.settings.file(input.scope, input.namespace))
        return yield* Effect.promise(() => file.delete(input.key))
      }),
      changes: os.settings.changes.effect(function* ({input, signal}) {
        const file = yield* Effect.promise(() => deps.settings.file(input.scope, input.namespace))
        return file.changes(signal)
      }),
    },
    drafts: {
      get: os.drafts.get.effect(function* ({input}) {
        const rows = yield* db.select().from(drafts).where(eq(drafts.sessionId, input.sessionId))
        return rows[0] ?? null
      }),
      set: os.drafts.set.effect(function* ({input}) {
        yield* db.insert(drafts).values(input).onConflictDoUpdate({target: drafts.sessionId, set: input})
        return {ok: true as const}
      }),
    },
    markers: {
      list: os.markers.list.effect(function* ({input}) {
        return yield* db
          .select()
          .from(markers)
          .where(eq(markers.sessionId, input.sessionId))
          .orderBy(asc(sql`rowid`))
      }),
    },
    registry: {
      catalog: os.registry.catalog.effect(function* () {
        return yield* pluginSignatures()
      }),
      call: toolCallOs.registry.call.effect(function* ({input, context, errors, path}) {
        const assist = deps.assist(context.session.id).find((capability) => capability.name === input.name)
        const plugin = assist === undefined ? yield* pluginSignature(input.name) : undefined
        if (assist === undefined && plugin === undefined) return yield* Effect.fail(errors.UNKNOWN_TOOL())
        const trace = callTrace((header) => rpcHeader(context, header), deps.code.ids)
        const run =
          assist === undefined
            ? runPluginTool(
                deps,
                {
                  sessionId: context.session.id,
                  name: input.name,
                  input: input.input,
                  callId: trace.callId,
                  widget: widgetCaller(context.callerOrigin, deps.allowedOrigins),
                },
                errors,
              )
            : Effect.tryPromise({try: () => assist.execute(input.input), catch: (error) => error})
        return yield* admitOutsideCall(deps, context, context.session, path.join('.')).pipe(
          Effect.andThen(hubTraced(deps, context, {name: input.name, input: input.input, trace}, run)),
          Effect.catchCause((cause) => Effect.fail(registryCallError(Cause.squash(cause), errors))),
        )
      }),
    },
    skill: {
      list: os.skill.list.effect(function* () {
        return yield* locationResponse(Skill.Service.use((skill) => skill.list()))
      }),
    },
    agent: {
      list: os.agent.list.effect(function* () {
        return yield* locationResponse(Agent.Service.use((agent) => agent.list()))
      }),
    },
    fs: {
      find: os.fs.find.effect(function* ({input}) {
        return yield* locationResponse(FileSystem.Service.use((files) => files.find(input)))
      }),
    },
    plugin: {
      call: os.plugin.call.effect(function* ({input}) {
        return yield* pluginCall(input)
      }),
      list: os.plugin.list.effect(function* () {
        return yield* locationResponse(
          Plugin.awaitActivation.pipe(Effect.andThen(Plugin.Service.use((plugins) => plugins.list()))),
        )
      }),
      experimental: os.plugin.experimental.effect(function* ({input, errors}) {
        return yield* missingPluginOutcome(yield* pluginExperimental(input.id), input.id, errors)
      }),
      experimentalChunk: os.plugin.experimentalChunk.effect(function* ({input, errors}) {
        return yield* missingPluginOutcome(yield* pluginExperimentalChunk(input), input.id, errors)
      }),
    },
    experimental: {
      persistentPty: {
        create: os.experimental.persistentPty.create.effect(function* ({input, context, errors}) {
          const created = yield* Effect.promise(() => deps.ptys.create(input, context.callerOrigin))
          if (created === null) return yield* Effect.fail(errors.NO_TTY())
          return created
        }),
        remove: os.experimental.persistentPty.remove.effect(function* ({input, errors}) {
          const pty = deps.ptys.find(input.ptyId)
          if (pty === undefined) return yield* Effect.fail(errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}}))
          if (pty.busy()) return yield* Effect.fail(errors.BUSY())
          yield* Effect.sync(() => pty.kill())
          return {ok: true as const}
        }),
        output: os.experimental.persistentPty.output.effect(function* ({input, context, errors, signal, lastEventId}) {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) return yield* Effect.fail(errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}}))
          const resumed = PtyResumeCursor.safeParse(lastEventId)
          const stream = ptyOutput(pty, {
            cursor: resumed.success ? resumed.data : input.cursor,
            overflow: () => errors.SLOW_CONSUMER({data: {capacity: OUTPUT_CAPACITY}}),
          })
          const events = yield* Stream.toAsyncIterableEffect(stream)
          return ptyEvents(relayEvents(events[Symbol.asyncIterator](), signal))
        }),
        write: os.experimental.persistentPty.write.effect(function* ({input, context, errors}) {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) return yield* Effect.fail(errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}}))
          yield* Effect.sync(() => writeToPty(pty, input.data))
          return {ok: true as const}
        }),
        resize: os.experimental.persistentPty.resize.effect(function* ({input, context, errors}) {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) return yield* Effect.fail(errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}}))
          yield* Effect.sync(() => pty.resize(input.cols, input.rows))
          return {ok: true as const}
        }),
        inject: os.experimental.persistentPty.inject.effect(function* ({input, context, errors}) {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) return yield* Effect.fail(errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}}))
          yield* Effect.sync(() => pty.inject(input.text))
          return {ok: true as const}
        }),
      },
    },
    event: {
      subscribe: os.event.subscribe.effect(function* ({input, signal}) {
        return yield* eventStream(deps.eventHeartbeatIntervalMs, input?.types, signal, deps.code.ids)
      }),
    },
    code: {
      describe: os.code.describe.effect(function* ({context, errors}) {
        return yield* Effect.promise(async (signal) =>
          (await resolveCodeSession(deps, undefined, {context, errors, signal})).describe(),
        )
      }),
      execute: os.code.execute.effect(function* ({input, context, errors}) {
        return yield* Effect.promise(async (signal) => {
          const code = await resolveCodeSession(deps, input.sessionId, {context, errors, signal})
          return (await code.execute(input.typescriptCode)).result
        })
      }),
      discover: os.code.discover.effect(function* ({input, context, errors}) {
        return yield* Effect.promise(async (signal) => {
          const code = await resolveCodeSession(deps, input.sessionId, {context, errors, signal})
          if (code.sandbox.discover === null) throw errors.NO_CODE_MODE({message: 'no tools to discover'})
          return code.discover(input.toolNames)
        })
      }),
    },
    meta: {
      models: os.meta.models.effect(function* ({input}) {
        return yield* Effect.promise(async (signal) => {
          const harness = await chat.harnessFor(input.sessionId)
          const {models, defaultModel, modelsFailed, login} = await buildHarnessMenuEntry(harness, signal, chat.log)
          return {models, defaultModel, modelsFailed, harness: buildHarnessMeta(harness), login}
        })
      }),
      harnesses: os.meta.harnesses.effect(function* () {
        return yield* Effect.promise(async (signal) => ({
          harnesses: await Promise.all(
            chat.harnesses.map((harness) => buildHarnessMenuEntry(harness, signal, chat.log)),
          ),
          defaultHarness: chat.defaultHarness.id,
        }))
      }),
      commands: os.meta.commands.effect(function* ({input, context}) {
        return yield* Effect.promise(() => listCommands(chat, {sessionId: input.sessionId, origin: context.origin}))
      }),
      tools: os.meta.tools.effect(function* ({input}) {
        return {tools: yield* Effect.promise(() => deps.tools(input.sessionId))}
      }),
      engine: os.meta.engine.effect(function* () {
        return yield* Effect.promise(() => engine.staleness())
      }),
      project: os.meta.project.effect(function* () {
        return yield* Effect.promise(() => readProject(deps.project))
      }),
      hubAgents: os.meta.hubAgents.effect(function* ({signal}) {
        return yield* Effect.sync(() => deps.hub.agents(signal))
      }),
      connectHub: os.meta.connectHub.effect(function* ({input}) {
        return yield* Effect.promise(() => deps.hub.connect(input.harness))
      }),
      disconnectHub: os.meta.disconnectHub.effect(function* ({input}) {
        return yield* Effect.promise(() => deps.hub.disconnect(input.harness))
      }),
    },
  })
}
