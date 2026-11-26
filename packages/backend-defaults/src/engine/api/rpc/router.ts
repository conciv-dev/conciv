import {z} from 'zod'
import type {Maker} from '@conciv/protocol/schema/identifier'
import {ORPCError, withEventMeta, type Router} from '@orpc/server'
import {asc, eq, sql} from 'drizzle-orm'
import {isToolError, type RegistryCallGate} from '@conciv/types/tool-call-types'
import type {HarnessAdapter} from '@conciv/harness'
import {drafts, markers} from '../../../db/schema.js'
import {Cause, Effect, Exit, Option, Result, Schema, Stream, Queue} from 'effect'
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
import {readProject} from '../../lib/project.js'
import {
  admitOutsideCall,
  makeHubAdmission,
  makeSessionOs,
  makeToolCallOs,
  os,
  type PluginHost,
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

function chatRouter(deps: RpcDeps, sessionOs: SessionOs): Router<typeof contract.chat, RpcContext> {
  return {
    events: os.chat.events.handler(({input, signal}) =>
      deps.runtime.forSession(input.sessionId).stream.events(signal ?? new AbortController().signal),
    ),
    send: os.chat.send.handler(({input, signal, lastEventId}) =>
      deps.chat.plane.send(
        {threadId: input.sessionId, runId: input.runId, messages: input.messages, lastEventId},
        signal,
      ),
    ),
    join: os.chat.join.handler(({input, signal, lastEventId}) =>
      deps.chat.plane.join({runId: input.runId, lastEventId: lastEventId ?? input.lastEventId}, signal),
    ),
    hydrate: os.chat.hydrate.handler(({input}) =>
      deps.runtime.forSession(input.sessionId).history.hydrate({limit: input.limit, before: input.before}),
    ),
    stop: os.chat.stop.handler(async ({input}) => {
      await deps.runtime.forSession(input.sessionId).run.stop(input.runIds)
      return {ok: true}
    }),
    permissionDecision: sessionOs.chat.permissionDecision.handler(async ({input, context, errors}) => {
      const decided = await decidePermissionCard(
        {
          answer: deps.answerPermission,
          publish: (sessionId, chunk) => deps.runtime.forSession(sessionId).stream.publish(chunk),
        },
        context.session.id,
        input,
      )
      if (!decided) throw errors.UNKNOWN_REQUEST()
      return {ok: true as const}
    }),
    uiReply: os.chat.uiReply.handler(({input, errors}) => {
      if (!deps.chat.plane.answerUi(input.sessionId, input.toolCallId, input.value)) {
        throw errors.UNKNOWN_REQUEST()
      }
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

async function requireLiveSession(deps: RpcDeps, sessionId: SessionId, errors: ApprovalErrors): Promise<void> {
  const row = await rowById(deps.chat.db, sessionId)
  if (row !== null && row.deletedAt === null) return
  throw errors.APPROVAL_DENIED({message: `session "${sessionId}" does not exist`})
}

async function runPluginTool(
  deps: RpcDeps,
  call: {sessionId: SessionId; name: string; input: unknown; callId: string; widget: boolean; signal?: AbortSignal},
  errors: RegistryErrors & ApprovalErrors,
): Promise<unknown> {
  if (!call.widget) await requireLiveSession(deps, call.sessionId, errors)
  const exit = await deps.pluginHost.runPromiseExit(
    settlingAsks(
      call.sessionId,
      callPluginTool(call.sessionId, call.name, call.input, {id: call.callId, widget: call.widget}),
      (sessionId, chunk) => deps.runtime.forSession(sessionId).stream.publish(chunk),
    ),
    {signal: call.signal},
  )
  if (Exit.isFailure(exit)) throw pluginToolError(call.name, exit.cause, errors)
  return registryAnswer(exit.value)
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

async function hubTraced<Result>(
  deps: RpcDeps,
  context: SessionContext,
  name: string,
  input: unknown,
  run: () => Promise<Result>,
  trace: ReturnType<typeof callTrace> = callTrace((header) => rpcHeader(context, header), deps.code.ids),
): Promise<Result> {
  if (trace.hub === null) return run()
  const scope = context.session
  const mirrored = {threadId: scope.id, live: await scope.run.live()}
  const mirror = trace.mirror(mirrored, {
    publish: scope.stream.publish,
    record: scope.run.record,
    driving: () => deps.code.driving(scope.id),
    log: deps.code.log,
  })
  await mirror.publish(trace.start(mirrored, name, input))
  try {
    const value = await run()
    mirror.publish(trace.result(mirrored, cappedText(safeStringify(value)), false))
    await mirror.settle()
    return value
  } catch (error) {
    mirror.publish(trace.result(mirrored, String(error), true))
    await mirror.settle()
    throw error
  }
}

type CodeErrors = {NO_CODE_MODE: (options?: {message: string}) => Error}

type CodeCall = {context: RpcContext; errors: CodeErrors; signal?: AbortSignal}

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
    signal: call.signal ?? new AbortController().signal,
  })
  if (code === null || code.sandbox === null) throw call.errors.NO_CODE_MODE()
  return code.sandbox
}

async function eventStream(
  host: PluginHost,
  heartbeatIntervalMs: number | undefined,
  types: ReadonlyArray<string> | undefined,
  signal: AbortSignal | undefined,
  ids: Maker,
) {
  const feed = await host.runPromise(EventFeed.Service.use(Effect.succeed))
  const connected = {id: Event.Id.create(ids), type: 'server.connected', data: {}}
  const output = Stream.unwrap(
    feed.subscribe(types).pipe(Effect.map((live) => Stream.make(connected).pipe(Stream.concat(live)))),
  )
  const heartbeat = Stream.tick(heartbeatIntervalMs ?? 15_000).pipe(
    Stream.drop(1),
    Stream.map(() => ({id: Event.Id.create(ids), type: 'server.heartbeat', data: {}})),
  )
  const stream = output.pipe(Stream.merge(heartbeat, {haltStrategy: 'left'}))
  return relayEvents(Stream.toAsyncIterableWith(stream, await host.context())[Symbol.asyncIterator](), signal)
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

function pluginList(host: PluginHost, signal: AbortSignal | undefined) {
  return host.runPromise(
    locationResponse(Plugin.awaitActivation.pipe(Effect.andThen(Plugin.Service.use((plugins) => plugins.list())))),
    {signal},
  )
}

function skillList(host: PluginHost, signal: AbortSignal | undefined) {
  return host.runPromise(locationResponse(Skill.Service.use((skill) => skill.list())), {signal})
}

function agentList(host: PluginHost, signal: AbortSignal | undefined) {
  return host.runPromise(locationResponse(Agent.Service.use((agent) => agent.list())), {signal})
}

function fsFind(host: PluginHost, input: FileSystem.FindInput, signal: AbortSignal | undefined) {
  return host.runPromise(locationResponse(FileSystem.Service.use((files) => files.find(input))), {signal})
}

function pluginExperimental(host: PluginHost, id: string, signal: AbortSignal | undefined) {
  return host.runPromise(
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const bundle = yield* plugins.experimental(Plugin.Id.make(id))
      if (!bundle) return undefined
      return yield* locationResponse(Effect.succeed(PluginExperimentalBundleSchema.parse(bundle)))
    }).pipe(Effect.result),
    {signal},
  )
}

function pluginExperimentalChunk(host: PluginHost, input: {id: string; file: string}, signal: AbortSignal | undefined) {
  return host.runPromise(
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const chunks = yield* plugins.experimentalChunk(Plugin.Id.make(input.id), input.file)
      if (!chunks) return undefined
      return yield* locationResponse(Effect.succeed(PluginExperimentalChunksSchema.parse(chunks)))
    }).pipe(Effect.result),
    {signal},
  )
}

function missingChunk(pluginId: string, file: string) {
  return {message: `No chunk ${file} in the current build of the plugin ${pluginId}`, data: {pluginId, file}}
}

function missingPlugin(pluginId: string) {
  const message = `No active plugin with a ./plugin-experimental bundle: ${pluginId}`
  return {message, data: {pluginId, message}}
}

async function pluginCall(
  host: PluginHost,
  input: {rpcId: string; method: string; input?: unknown},
  signal?: AbortSignal,
) {
  return host.runPromise(
    Plugin.awaitActivation.pipe(
      Effect.andThen(Rpc.Service.use((rpc) => rpc.call(input.rpcId, input.method, input.input))),
      Effect.catchDefect((defect) =>
        Effect.logError('rpc call failed', {rpc: input.rpcId, method: input.method, defect}).pipe(
          Effect.andThen(Effect.fail({type: 'rpc.internal', message: 'RPC call failed'})),
        ),
      ),
      Effect.result,
    ),
    {signal},
  )
}

export function makeRpcRouter(deps: RpcDeps): Router<typeof contract, RpcContext> {
  const chat = deps.chat
  const db = chat.db
  const engine = deps.runtime.engine
  const sessionOs = makeSessionOs(deps)
  const toolCallOs = makeToolCallOs(deps)
  return os.use(makeHubAdmission(deps)).router({
    auth: deps.auth,
    sessions: sessionsRouter(deps),
    tabs: tabsRouter(deps),
    chat: chatRouter(deps, sessionOs),
    settings: {
      all: os.settings.all.handler(async ({input}) => (await deps.settings.file(input.scope, input.namespace)).read()),
      set: os.settings.set.handler(async ({input}) =>
        (await deps.settings.file(input.scope, input.namespace)).set(input.key, input.value),
      ),
      delete: os.settings.delete.handler(async ({input}) =>
        (await deps.settings.file(input.scope, input.namespace)).delete(input.key),
      ),
      changes: os.settings.changes.handler(async ({input, signal}) =>
        (await deps.settings.file(input.scope, input.namespace)).changes(signal),
      ),
    },
    drafts: {
      get: os.drafts.get.handler(async ({input}) => {
        const rows = await Effect.runPromise(db.select().from(drafts).where(eq(drafts.sessionId, input.sessionId)))
        return rows[0] ?? null
      }),
      set: os.drafts.set.handler(async ({input}) => {
        await Effect.runPromise(
          db.insert(drafts).values(input).onConflictDoUpdate({target: drafts.sessionId, set: input}),
        )
        return {ok: true as const}
      }),
    },
    markers: {
      list: os.markers.list.handler(({input}) =>
        Effect.runPromise(
          db
            .select()
            .from(markers)
            .where(eq(markers.sessionId, input.sessionId))
            .orderBy(asc(sql`rowid`)),
        ),
      ),
    },
    registry: {
      catalog: os.registry.catalog.handler(({signal}) => deps.pluginHost.runPromise(pluginSignatures(), {signal})),
      call: toolCallOs.registry.call.handler(async ({input, context, errors, signal, path}) => {
        const assist = deps.assist(context.session.id).find((capability) => capability.name === input.name)
        const plugin =
          assist === undefined ? await deps.pluginHost.runPromise(pluginSignature(input.name), {signal}) : undefined
        if (assist === undefined && plugin === undefined) throw errors.UNKNOWN_TOOL()
        const trace = callTrace((header) => rpcHeader(context, header), deps.code.ids)
        const gate: RegistryCallGate = async (run) => {
          await admitOutsideCall(deps, context, context.session, signal, path.join('.'))
          return hubTraced(deps, context, input.name, input.input, run, trace)
        }
        const pluginRun = () =>
          runPluginTool(
            deps,
            {
              sessionId: context.session.id,
              name: input.name,
              input: input.input,
              callId: trace.callId,
              widget: widgetCaller(context.callerOrigin, deps.allowedOrigins),
              signal,
            },
            errors,
          )
        const call = (): Promise<unknown> =>
          assist === undefined ? gate(pluginRun) : gate(() => assist.execute(input.input))
        return call().catch((error: unknown) => {
          throw registryCallError(error, errors)
        })
      }),
    },
    skill: {
      list: os.skill.list.handler(({signal}) => skillList(deps.pluginHost, signal)),
    },
    agent: {
      list: os.agent.list.handler(({signal}) => agentList(deps.pluginHost, signal)),
    },
    fs: {
      find: os.fs.find.handler(({input, signal}) => fsFind(deps.pluginHost, input, signal)),
    },
    plugin: {
      call: os.plugin.call.handler(async ({input, errors, signal}) => {
        const outcome = await pluginCall(deps.pluginHost, input, signal)
        if (Result.isSuccess(outcome)) return outcome.success
        const {type, message} = outcome.failure
        if (type === 'rpc.internal' || type === 'rpc.invalid_output')
          throw errors.PLUGIN_RPC_INTERNAL({message, data: {type, message}})
        throw errors.PLUGIN_RPC({message, data: outcome.failure})
      }),
      list: os.plugin.list.handler(({signal}) => pluginList(deps.pluginHost, signal)),
      experimental: os.plugin.experimental.handler(async ({input, errors, signal}) => {
        const outcome = await pluginExperimental(deps.pluginHost, input.id, signal)
        if (Result.isFailure(outcome)) throw errors.PLUGIN_CHUNK_NOT_FOUND(missingChunk(input.id, outcome.failure.file))
        if (outcome.success !== undefined) return outcome.success
        throw errors.PLUGIN_NOT_FOUND(missingPlugin(input.id))
      }),
      experimentalChunk: os.plugin.experimentalChunk.handler(async ({input, errors, signal}) => {
        const outcome = await pluginExperimentalChunk(deps.pluginHost, input, signal)
        if (Result.isFailure(outcome)) throw errors.PLUGIN_CHUNK_NOT_FOUND(missingChunk(input.id, outcome.failure.file))
        if (outcome.success !== undefined) return outcome.success
        throw errors.PLUGIN_NOT_FOUND(missingPlugin(input.id))
      }),
    },
    experimental: {
      persistentPty: {
        create: os.experimental.persistentPty.create.handler(async ({input, context, errors}) => {
          const created = await deps.ptys.create(input, context.callerOrigin)
          if (created === null) throw errors.NO_TTY()
          return created
        }),
        remove: os.experimental.persistentPty.remove.handler(({input, errors}) => {
          const pty = deps.ptys.find(input.ptyId)
          if (pty === undefined) throw errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}})
          if (pty.busy()) throw errors.BUSY()
          pty.kill()
          return {ok: true as const}
        }),
        output: os.experimental.persistentPty.output.handler(({input, context, errors, signal, lastEventId}) => {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) throw errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}})
          const resumed = PtyResumeCursor.safeParse(lastEventId)
          const stream = ptyOutput(pty, {
            cursor: resumed.success ? resumed.data : input.cursor,
            overflow: () => errors.SLOW_CONSUMER({data: {capacity: OUTPUT_CAPACITY}}),
          })
          return ptyEvents(relayEvents(Stream.toAsyncIterable(stream)[Symbol.asyncIterator](), signal))
        }),
        write: os.experimental.persistentPty.write.handler(({input, context, errors}) => {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) throw errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}})
          writeToPty(pty, input.data)
          return {ok: true as const}
        }),
        resize: os.experimental.persistentPty.resize.handler(({input, context, errors}) => {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) throw errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}})
          pty.resize(input.cols, input.rows)
          return {ok: true as const}
        }),
        inject: os.experimental.persistentPty.inject.handler(({input, context, errors}) => {
          const pty = deps.ptys.admitted(input.ptyId, context.callerOrigin)
          if (pty === undefined) throw errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}})
          pty.inject(input.text)
          return {ok: true as const}
        }),
      },
    },
    event: {
      subscribe: os.event.subscribe.handler(({input, signal}) =>
        eventStream(deps.pluginHost, deps.eventHeartbeatIntervalMs, input?.types, signal, deps.code.ids),
      ),
    },
    code: {
      describe: os.code.describe.handler(async (call) => (await resolveCodeSession(deps, undefined, call)).describe()),
      execute: os.code.execute.handler(async ({input, ...call}) => {
        const code = await resolveCodeSession(deps, input.sessionId, call)
        return (await code.execute(input.typescriptCode)).result
      }),
      discover: os.code.discover.handler(async ({input, ...call}) => {
        const code = await resolveCodeSession(deps, input.sessionId, call)
        if (code.sandbox.discover === null) throw call.errors.NO_CODE_MODE({message: 'no tools to discover'})
        return code.discover(input.toolNames)
      }),
    },
    meta: {
      models: os.meta.models.handler(async ({input, signal = new AbortController().signal}) => {
        const harness = await chat.harnessFor(input.sessionId)
        const {models, defaultModel, modelsFailed, login} = await buildHarnessMenuEntry(harness, signal, chat.log)
        return {models, defaultModel, modelsFailed, harness: buildHarnessMeta(harness), login}
      }),
      harnesses: os.meta.harnesses.handler(async ({signal = new AbortController().signal}) => ({
        harnesses: await Promise.all(chat.harnesses.map((harness) => buildHarnessMenuEntry(harness, signal, chat.log))),
        defaultHarness: chat.defaultHarness.id,
      })),
      commands: os.meta.commands.handler(({input, context}) =>
        listCommands(chat, {sessionId: input.sessionId, origin: context.origin}),
      ),
      tools: os.meta.tools.handler(async ({input}) => ({tools: await deps.tools(input.sessionId)})),
      engine: os.meta.engine.handler(() => engine.staleness()),
      project: os.meta.project.handler(() => readProject(deps.project)),
      hubAgents: os.meta.hubAgents.handler(({signal}) => deps.hub.agents(signal)),
      connectHub: os.meta.connectHub.handler(({input}) => deps.hub.connect(input.harness)),
      disconnectHub: os.meta.disconnectHub.handler(({input}) => deps.hub.disconnect(input.harness)),
    },
  })
}
