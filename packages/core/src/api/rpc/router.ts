import {z} from 'zod'
import {ORPCError} from '@orpc/server'
import {asc, eq, sql} from 'drizzle-orm'
import {isPageFailure, PAGE_ERROR_CODES, type PageErrorCode} from '@conciv/protocol/page-types'
import {isPageVerbError} from '@conciv/extension'
import {isToolError, type RegistryCallGate} from '@conciv/protocol/tool-call-types'
import {resolveHarnessModels} from '@conciv/harness'
import {drafts, markers} from '@conciv/db'
import type {Router} from '@orpc/server'
import {Cause, Effect, Exit, Option, Result, Stream} from 'effect'
import {Event, Location, Plugin, Rpc, Tool} from '@conciv/plugin-host'
import {EventFeed} from '../../event-feed.js'
import {
  cappedText,
  PluginExperimentalBundleSchema,
  PluginExperimentalChunksSchema,
  safeStringify,
  type contract,
  type RegistryCallErrorName,
} from '@conciv/contract'
import {widgetCaller} from '../../lib/cors.js'
import {listCommands} from '../../sessions/commands.js'
import {chatRouter} from './chat.js'
import {buildHarnessMenuEntry, buildHarnessMeta, sessionsRouter} from './sessions.js'
import {
  admitOutsideCall,
  makeHubAdmission,
  makeSessionOs,
  makeToolCallOs,
  os,
  type PluginHost,
  type RpcDeps,
} from './mount.js'
import type {SessionScope} from '../../runtime/scope-types.js'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import {callTrace} from '../call-trace.js'
import {openCodeSession, type CodeSandboxSession} from '../mcp.js'
import {
  askedPagePermission,
  callPluginTool,
  isPageTool,
  pagePermissionAllows,
  pluginSignature,
  pluginSignatures,
} from '../../runtime/plugin-signatures.js'
import type {SessionId} from '@conciv/protocol/chat-types'

export const PAGE_ERROR_NAME = {
  'no-widget': 'NO_PAGE_CLIENT',
  timeout: 'PAGE_TIMEOUT',
  'unknown-verb': 'UNKNOWN_TOOL',
  'invalid-args': 'INVALID_ARGS',
  'handler-error': 'HANDLER_ERROR',
} as const satisfies Record<PageErrorCode, RegistryCallErrorName>

type RegistryErrors = Record<RegistryCallErrorName, (options: {message: string; cause: unknown}) => Error>
type ApprovalErrors = {APPROVAL_DENIED: (options: {message: string}) => Error}
type SessionContext = RpcContext & {session: SessionScope}
type GatedCall = {context: SessionContext; errors: ApprovalErrors; signal?: AbortSignal}

function registryCallError(error: unknown, errors: RegistryErrors): Error {
  if (isPageVerbError(error)) return errors[PAGE_ERROR_NAME[error.code]]({message: error.message, cause: error})
  if (isPageFailure(error)) {
    return errors[PAGE_ERROR_NAME[error.error.code]]({message: error.error.message, cause: error})
  }
  if (isToolError(error)) return new ORPCError(error.code, {message: error.message, data: error.data, cause: error})
  if (error instanceof ORPCError) return error
  return errors.HANDLER_ERROR({message: error instanceof Error ? error.message : String(error), cause: error})
}

const PluginPageFailure = z.object({code: z.enum(PAGE_ERROR_CODES), message: z.string()})

function pluginToolError(name: string, cause: Cause.Cause<unknown>, errors: RegistryErrors): Error {
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure)) return registryCallError(Cause.squash(cause), errors)
  const page = PluginPageFailure.safeParse(z.object({metadata: z.unknown()}).safeParse(failure.value).data?.metadata)
  if (page.success) {
    return errors[PAGE_ERROR_NAME[page.data.code]]({message: `${name}: ${page.data.message}`, cause: failure.value})
  }
  return registryCallError(failure.value, errors)
}

async function requireAttachedPage(
  deps: RpcDeps,
  call: {sessionId: SessionId; name: string},
  errors: RegistryErrors,
): Promise<void> {
  const attached = await deps.queues.attachedSessions()
  if (attached.includes(call.sessionId)) return
  const reason =
    attached.length > 0
      ? 'the page is showing another session; switch back to this session to use page tools'
      : 'no widget connected to session'
  throw errors.NO_PAGE_CLIENT({message: `${call.name}: ${reason}`, cause: undefined})
}

async function runPluginTool(
  deps: RpcDeps,
  call: {sessionId: SessionId; name: string; input: unknown; callId: string; signal?: AbortSignal},
  errors: RegistryErrors,
): Promise<unknown> {
  if (isPageTool(call.name)) await requireAttachedPage(deps, call, errors)
  const exit = await deps.pluginHost.runPromiseExit(
    callPluginTool(call.sessionId, call.name, call.input, call.callId),
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

async function refuseUnapproved(deps: RpcDeps, name: string, input: unknown, call: GatedCall): Promise<void> {
  const widget = widgetCaller(call.context.callerOrigin, deps.allowedOrigins)
  const asked = askedPagePermission(name, input)
  if (asked === undefined && widget) return
  if (asked === undefined && callTrace((header) => rpcHeader(call.context, header)).hub?.namedTab === true) return
  const catalog = [...deps.runtime.engine.catalog(), ...(await deps.pluginHost.runPromise(pluginSignatures))]
  const asks = catalog.find((tool) => tool.name === name)?.approval === 'ask'
  if (!asks) return
  const scope = call.context.session
  const allowed =
    asked !== undefined &&
    (await deps.pluginHost.runPromise(
      pagePermissionAllows(scope.id, asked).pipe(
        Effect.catchTag('Permission.BlockedError', (blocked) =>
          Effect.fail(call.errors.APPROVAL_DENIED({message: blocked.message})),
        ),
      ),
      {signal: call.signal},
    ))
  if (allowed || widget) return
  const refusal = await deps.chat.plane.admitCall(scope.id, {toolName: name, input, publish: scope.stream.publish})
  if (refusal !== null) throw call.errors.APPROVAL_DENIED({message: refusal.message})
}

async function hubTraced<Result>(
  deps: RpcDeps,
  context: SessionContext,
  name: string,
  input: unknown,
  run: () => Promise<Result>,
  trace: ReturnType<typeof callTrace> = callTrace((header) => rpcHeader(context, header)),
): Promise<Result> {
  if (trace.hub === null) return run()
  const scope = context.session
  const mirrored = {threadId: scope.id, live: await scope.run.live()}
  const mirror = trace.mirror(mirrored, {
    publish: scope.stream.publish,
    record: scope.run.record,
    driving: () => deps.code.driving(scope.id),
  })
  mirror.publish(trace.start(mirrored, name, input))
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

function replyWentOut(context: RpcContext, signal: AbortSignal | undefined): Promise<boolean> | undefined {
  return context.replied?.then((sent) => sent && signal?.aborted !== true)
}

async function resolveCodeSession(
  deps: RpcDeps,
  sessionId: SessionId | undefined,
  call: CodeCall,
): Promise<CodeSandboxSession> {
  const trace = callTrace((header) => rpcHeader(call.context, header))
  const scope =
    sessionId === undefined ? await deps.code.resolveSession(null, null) : deps.runtime.forSession(sessionId)
  const code = await openCodeSession(deps.code, scope, {
    trace,
    outside: trace.hub !== null && sessionId === undefined,
    askBeforeCalls: trace.hub === null,
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
) {
  const feed = await host.runPromise(EventFeed.Service.use(Effect.succeed))
  const connected = {id: Event.Id.create(), type: 'server.connected', data: {}}
  const output = Stream.unwrap(
    feed.subscribe(types).pipe(Effect.map((live) => Stream.make(connected).pipe(Stream.concat(live)))),
  )
  const heartbeat = Stream.tick(heartbeatIntervalMs ?? 15_000).pipe(
    Stream.drop(1),
    Stream.map(() => ({id: Event.Id.create(), type: 'server.heartbeat', data: {}})),
  )
  const stream = output.pipe(Stream.merge(heartbeat, {haltStrategy: 'left'}))
  return relayEvents(Stream.toAsyncIterable(stream)[Symbol.asyncIterator](), signal)
}

async function* relayEvents<Value>(events: AsyncIterator<Value>, signal: AbortSignal | undefined) {
  const stop = () => void events.return?.()
  signal?.addEventListener('abort', stop, {once: true})
  try {
    for (;;) {
      const step = await events.next()
      if (step.done === true) return
      yield step.value
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    await events.return?.()
  }
}

function locationResponse<Data, Failure>(data: Effect.Effect<Data, Failure, Plugin.Interface>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    return {location: {directory: location.directory}, data: yield* data}
  })
}

function pluginList(host: PluginHost, signal: AbortSignal | undefined) {
  return host.runPromise(locationResponse(Plugin.Service.use((plugins) => plugins.list())), {signal})
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
    navigation: {
      get: os.navigation.get.handler(() => engine.navigation.get()),
      set: os.navigation.set.handler(({input}) => engine.navigation.set(input)),
    },
    registry: {
      catalog: os.registry.catalog.handler(async ({signal}) => [
        ...engine.catalog(),
        ...(await deps.pluginHost.runPromise(pluginSignatures, {signal})),
      ]),
      call: toolCallOs.registry.call.handler(async ({input, context, errors, signal, path}) => {
        const assist = deps.assist(context.session.id).find((capability) => capability.name === input.name)
        const registered = assist !== undefined || context.session.tools.has(input.name)
        const plugin = registered ? undefined : await deps.pluginHost.runPromise(pluginSignature(input.name), {signal})
        if (!registered && plugin === undefined) throw errors.UNKNOWN_TOOL()
        const trace = callTrace((header) => rpcHeader(context, header))
        if (trace.hub !== null) deps.code.hubCall(context.session.id, trace.callId)
        const gate: RegistryCallGate = async (run) => {
          await admitOutsideCall(deps, context, context.session, signal, path.join('.'))
          await refuseUnapproved(deps, input.name, input.input, {context, errors, signal})
          return hubTraced(deps, context, input.name, input.input, run, trace)
        }
        const pluginRun = () =>
          runPluginTool(
            deps,
            {sessionId: context.session.id, name: input.name, input: input.input, callId: trace.callId, signal},
            errors,
          )
        const call = (): Promise<unknown> =>
          plugin !== undefined
            ? gate(pluginRun)
            : assist === undefined
              ? context.session.tools.call(input.name, input.input, {
                  toolCallId: trace.callId,
                  signal,
                  gate,
                })
              : gate(() => assist.execute(input.input))
        return call()
          .catch((error: unknown) => {
            throw registryCallError(error, errors)
          })
          .finally(async () => {
            if (trace.hub !== null) await deps.code.hubReplied(context.session.id, new Set([trace.callId]))
          })
      }),
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
        create: os.experimental.persistentPty.create.handler(async ({input, errors}) => {
          const created = await deps.ptys.create(input)
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
        connectToken: os.experimental.persistentPty.connectToken.handler(({input, context, errors}) => {
          if (deps.ptys.find(input.ptyId) === undefined) throw errors.PTY_NOT_FOUND({data: {ptyId: input.ptyId}})
          return deps.ptys.issueTicket({ptyId: input.ptyId, origin: context.callerOrigin})
        }),
      },
    },
    event: {
      subscribe: os.event.subscribe.handler(({input, signal}) =>
        eventStream(deps.pluginHost, deps.eventHeartbeatIntervalMs, input?.types, signal),
      ),
    },
    captures: {
      list: os.captures.list.handler(({input}) => deps.runtime.forSession(input.sessionId).captures.list()),
    },
    tabs: {
      list: os.tabs.list.handler(() => deps.tabs.list()),
      get: os.tabs.get.handler(({input}) => deps.tabs.get(input.sessionId)),
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
    page: {
      queue: {
        wait: os.page.queue.wait.handler(({input, context, errors, signal}) =>
          deps.queueWait(input, signal, replyWentOut(context, signal)).catch((error: unknown) => {
            if (signal?.aborted === true) throw error
            throw errors.NO_QUEUE({message: error instanceof Error ? error.message : String(error)})
          }),
        ),
      },
      symbolicate: os.page.symbolicate.handler(({input}) => engine.symbolicate(input.frames)),
      changes: sessionOs.page.changes.handler(({context}) =>
        hubTraced(deps, context, 'page_changes', {}, () => deps.queues.changes(context.session.id)),
      ),
      clearChanges: sessionOs.page.clearChanges.handler(({context}) =>
        hubTraced(deps, context, 'page_clear_changes', {}, () => deps.queues.clearChanges(context.session.id)),
      ),
      queries: sessionOs.page.queries.handler(({input, context, signal}) =>
        context.session.page.queries(signal ?? new AbortController().signal, input.focus),
      ),
      focus: sessionOs.page.focus.handler(({input, context}) => {
        context.session.page.focus(input.browserTab, input)
        return {ok: true as const}
      }),
      reply: sessionOs.page.reply.handler(({input, context, errors}) => {
        if (!context.session.page.reply(input.requestId, input.outcome)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    editor: {
      openFromFrames: os.editor.openFromFrames.handler(({input}) => deps.openFromFrames(input.frames)),
    },
    meta: {
      models: os.meta.models.handler(async ({input}) => {
        const harness = await chat.harnessFor(input.sessionId)
        const models = await resolveHarnessModels(harness, {signal: chat.signal})
        return {
          models,
          defaultModel: harness.defaultModel ?? models[0]?.id ?? null,
          harness: buildHarnessMeta(harness),
        }
      }),
      harnesses: os.meta.harnesses.handler(async () => ({
        harnesses: await Promise.all(chat.harnesses.map((harness) => buildHarnessMenuEntry(harness, chat.signal))),
        defaultHarness: chat.defaultHarness.id,
      })),
      commands: os.meta.commands.handler(({input, context}) =>
        listCommands(chat, {sessionId: input.sessionId, origin: context.origin}),
      ),
      tools: os.meta.tools.handler(() => ({tools: deps.tools})),
      engine: os.meta.engine.handler(() => engine.staleness()),
      hubAgents: os.meta.hubAgents.handler(({signal}) => deps.hub.agents(signal)),
      connectHub: os.meta.connectHub.handler(({input}) => deps.hub.connect(input.harness)),
      disconnectHub: os.meta.disconnectHub.handler(({input}) => deps.hub.disconnect(input.harness)),
    },
  })
}
