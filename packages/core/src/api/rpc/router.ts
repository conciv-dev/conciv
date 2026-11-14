import {z} from 'zod'
import {ORPCError} from '@orpc/server'
import {asc, eq, sql} from 'drizzle-orm'
import {isPageFailure, type PageErrorCode} from '@conciv/protocol/page-types'
import {isPageVerbError, isToolError} from '@conciv/extension'
import type {RegistryCallGate} from '@conciv/extension/registry'
import {resolveHarnessModels} from '@conciv/harness'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOL} from '@conciv/tools/builtins'
import {drafts, markers} from '@conciv/db'
import type {Router} from '@orpc/server'
import {Effect, Result, Stream} from 'effect'
import {Event, Location, Plugin, Rpc} from '@conciv/plugin-host'
import {EventFeed} from '../../runtime/event-feed.js'
import {
  cappedText,
  PluginExperimentalBundleSchema,
  safeStringify,
  type contract,
  type RegistryCallErrorName,
} from '@conciv/contract'
import {widgetCaller} from '../../lib/cors.js'
import {listCommands} from '../../sessions/commands.js'
import {session} from '../../runtime/session-context.js'
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
import type {SessionId} from '@conciv/protocol/chat-types'

export const PAGE_ERROR_NAME = {
  'no-widget': 'NO_PAGE_CLIENT',
  timeout: 'PAGE_TIMEOUT',
  'unknown-verb': 'UNKNOWN_TOOL',
  'invalid-args': 'INVALID_ARGS',
  'handler-error': 'HANDLER_ERROR',
} as const satisfies Record<PageErrorCode, RegistryCallErrorName>

type RegistryErrors = Record<RegistryCallErrorName, (options: {message: string; cause: unknown}) => Error>
type BundlerErrors = {NO_BUNDLER: () => Error}
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

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function callTool<Output extends z.ZodType>(
  tool: {name: string; outputSchema?: Output},
  input: unknown,
  errors?: BundlerErrors,
): Promise<z.output<Output>> {
  const output = tool.outputSchema
  if (output === undefined) throw new Error(`tool "${tool.name}" declares no output schema`)
  try {
    return output.parse(await session().tools.call(tool.name, input))
  } catch (error) {
    if (errors && hasErrorCode(error, 'NO_BUNDLER')) throw errors.NO_BUNDLER()
    throw error
  }
}

async function refuseUnapproved(deps: RpcDeps, name: string, input: unknown, call: GatedCall): Promise<void> {
  if (widgetCaller(call.context.callerOrigin, deps.allowedOrigins)) return
  if (callTrace((header) => rpcHeader(call.context, header)).hub?.namedTab === true) return
  const asks = deps.runtime.engine.catalog().find((tool) => tool.name === name)?.approval === 'ask'
  if (!asks) return
  const scope = call.context.session
  const refusal = await deps.chat.plane.admitCall(scope.id, {toolName: name, input, publish: scope.stream.publish})
  if (refusal !== null) throw call.errors.APPROVAL_DENIED({message: refusal.message})
}

async function hubTraced<Result>(
  context: SessionContext,
  name: string,
  input: unknown,
  run: () => Promise<Result>,
  trace: ReturnType<typeof callTrace> = callTrace((header) => rpcHeader(context, header)),
): Promise<Result> {
  if (trace.hub === null) return run()
  const scope = context.session
  const mirrored = {threadId: scope.id, live: await scope.run.live()}
  const mirror = trace.mirror(mirrored, {publish: scope.stream.publish, record: scope.run.record})
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
  types: ReadonlyArray<string> | undefined,
  signal: AbortSignal | undefined,
) {
  const feed = await host.runPromise(EventFeed.Service.use(Effect.succeed))
  const connected = {id: Event.Id.create(), type: 'server.connected', data: {}}
  const output = Stream.unwrap(
    feed.subscribe(types).pipe(Effect.map((live) => Stream.make(connected).pipe(Stream.concat(live)))),
  )
  return relayEvents(Stream.toAsyncIterable(output)[Symbol.asyncIterator](), signal)
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
    }),
    {signal},
  )
}

async function pluginCall(
  host: PluginHost,
  input: {rpcId: string; method: string; input?: unknown},
  signal?: AbortSignal,
) {
  return host.runPromise(
    Rpc.Service.use((rpc) => rpc.call(input.rpcId, input.method, input.input)).pipe(
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
        const rows = await db.select().from(drafts).where(eq(drafts.sessionId, input.sessionId))
        return rows[0] ?? null
      }),
      set: os.drafts.set.handler(async ({input}) => {
        const row = {...input, updatedAt: Date.now()}
        await db.insert(drafts).values(row).onConflictDoUpdate({target: drafts.sessionId, set: row})
        return {ok: true as const}
      }),
    },
    markers: {
      list: os.markers.list.handler(({input}) =>
        db
          .select()
          .from(markers)
          .where(eq(markers.sessionId, input.sessionId))
          .orderBy(asc(sql`rowid`)),
      ),
    },
    navigation: {
      get: os.navigation.get.handler(() => engine.navigation.get()),
      set: os.navigation.set.handler(({input}) => engine.navigation.set(input)),
    },
    registry: {
      catalog: os.registry.catalog.handler(() => engine.catalog()),
      call: toolCallOs.registry.call.handler(async ({input, context, errors, signal, path}) => {
        const assist = deps.assist(context.session.id).find((capability) => capability.name === input.name)
        if (assist === undefined && !context.session.tools.has(input.name)) throw errors.UNKNOWN_TOOL()
        const trace = callTrace((header) => rpcHeader(context, header))
        if (trace.hub !== null) deps.code.hubCall(context.session.id, trace.callId)
        const gate: RegistryCallGate = async (run) => {
          await admitOutsideCall(deps, context, context.session, signal, path.join('.'))
          await refuseUnapproved(deps, input.name, input.input, {context, errors, signal})
          return hubTraced(context, input.name, input.input, run, trace)
        }
        const call = (): Promise<unknown> =>
          assist === undefined
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
          .finally(() => {
            if (trace.hub !== null) deps.code.hubReplied(context.session.id, new Set([trace.callId]))
          })
      }),
    },
    plugin: {
      call: os.plugin.call.handler(async ({input, errors, signal}) => {
        const outcome = await pluginCall(deps.pluginHost, input, signal)
        if (Result.isSuccess(outcome)) return outcome.success
        throw errors.PLUGIN_RPC({message: outcome.failure.message, data: outcome.failure})
      }),
      list: os.plugin.list.handler(({signal}) => pluginList(deps.pluginHost, signal)),
      experimental: os.plugin.experimental.handler(async ({input, errors, signal}) => {
        const bundle = await pluginExperimental(deps.pluginHost, input.id, signal)
        if (bundle !== undefined) return bundle
        const message = `No active plugin with a ./plugin-experimental bundle: ${input.id}`
        throw errors.PLUGIN_NOT_FOUND({message, data: {pluginId: input.id, message}})
      }),
    },
    event: {
      subscribe: os.event.subscribe.handler(({input, signal}) => eventStream(deps.pluginHost, input?.types, signal)),
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
        wait: os.page.queue.wait.handler(({input, errors, signal}) =>
          deps.queues.wait(input.sessionId, input.queueId, input.waitMs, signal).catch((error: unknown) => {
            if (signal?.aborted === true) throw error
            throw errors.NO_QUEUE({message: error instanceof Error ? error.message : String(error)})
          }),
        ),
      },
      symbolicate: os.page.symbolicate.handler(({input}) => engine.symbolicate(input.frames)),
      changes: sessionOs.page.changes.handler(({context}) =>
        hubTraced(context, 'page_changes', {}, () => context.session.page.changes()),
      ),
      clearChanges: sessionOs.page.clearChanges.handler(({context}) =>
        hubTraced(context, 'page_clear_changes', {}, async () => {
          await context.session.page.clearChanges()
          return {ok: true as const}
        }),
      ),
      queries: sessionOs.page.queries.handler(({context, signal}) =>
        context.session.page.queries(signal ?? new AbortController().signal),
      ),
      reply: sessionOs.page.reply.handler(({input, context, errors}) => {
        if (!context.session.page.reply(input.requestId, input.outcome)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    server: {
      config: sessionOs.server.config.handler(({context, errors}) =>
        hubTraced(context, BUILTIN_SERVER_TOOL.server_config.name, {}, () =>
          callTool(BUILTIN_SERVER_TOOL.server_config, {}, errors),
        ),
      ),
      resolve: sessionOs.server.resolve.handler(({input, context, errors}) =>
        hubTraced(context, BUILTIN_SERVER_TOOL.server_resolve.name, input, () =>
          callTool(BUILTIN_SERVER_TOOL.server_resolve, input, errors),
        ),
      ),
      graph: sessionOs.server.graph.handler(({input, context, errors}) =>
        hubTraced(context, BUILTIN_SERVER_TOOL.server_graph.name, input, () =>
          callTool(BUILTIN_SERVER_TOOL.server_graph, input, errors),
        ),
      ),
      transform: sessionOs.server.transform.handler(({input, context, errors}) =>
        hubTraced(context, BUILTIN_SERVER_TOOL.server_transform.name, input, () =>
          callTool(BUILTIN_SERVER_TOOL.server_transform, input, errors),
        ),
      ),
      urls: sessionOs.server.urls.handler(({context, errors}) =>
        hubTraced(context, BUILTIN_SERVER_TOOL.server_urls.name, {}, () =>
          callTool(BUILTIN_SERVER_TOOL.server_urls, {}, errors),
        ),
      ),
      reload: sessionOs.server.reload.handler(async ({input, context, errors, signal}) => {
        await refuseUnapproved(deps, BUILTIN_SERVER_TOOL.server_reload.name, input, {context, errors, signal})
        return hubTraced(context, BUILTIN_SERVER_TOOL.server_reload.name, input, () =>
          callTool(BUILTIN_SERVER_TOOL.server_reload, input, errors),
        )
      }),
      restart: sessionOs.server.restart.handler(async ({input, context, errors, signal}) => {
        await refuseUnapproved(deps, BUILTIN_SERVER_TOOL.server_restart.name, input, {context, errors, signal})
        return hubTraced(context, BUILTIN_SERVER_TOOL.server_restart.name, input, () =>
          callTool(BUILTIN_SERVER_TOOL.server_restart, input, errors),
        )
      }),
    },
    editor: {
      open: sessionOs.editor.open.handler(({input, context}) =>
        hubTraced(context, BUILTIN_OPEN_TOOL.name, input, () => callTool(BUILTIN_OPEN_TOOL, input)),
      ),
      openFromFrames: os.editor.openFromFrames.handler(({input}) => deps.openFromFrames(input.frames)),
    },
    meta: {
      models: os.meta.models.handler(async ({input}) => {
        const harness = chat.harnessFor(input.sessionId)
        const models = await resolveHarnessModels(harness)
        return {
          models,
          defaultModel: harness.defaultModel ?? models[0]?.id ?? null,
          harness: buildHarnessMeta(harness),
        }
      }),
      harnesses: os.meta.harnesses.handler(async () => ({
        harnesses: await Promise.all(chat.harnesses.map(buildHarnessMenuEntry)),
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
