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
import type {contract, RegistryCallErrorName} from '@conciv/contract'
import {widgetCaller} from '../../lib/cors.js'
import {listCommands} from '../../sessions/commands.js'
import {session} from '../../runtime/session-context.js'
import {chatRouter} from './chat.js'
import {harnessMenuEntryOf, harnessMetaOf, sessionsRouter} from './sessions.js'
import {admitOutsideCall, makeHubAdmission, makeSessionOs, makeToolCallOs, os, type RpcDeps} from './mount.js'
import type {SessionScope} from '../../runtime/scope-types.js'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import {cappedText, safeStringify} from '@conciv/chat'
import {callTrace} from '../call-trace.js'

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
): Promise<Result> {
  const trace = callTrace((header) => rpcHeader(context, header))
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
      all: os.settings.all.handler(({input}) => deps.settings.file(input.scope, input.namespace).read()),
      set: os.settings.set.handler(({input}) =>
        deps.settings.file(input.scope, input.namespace).set(input.key, input.value),
      ),
      delete: os.settings.delete.handler(({input}) =>
        deps.settings.file(input.scope, input.namespace).delete(input.key),
      ),
      changes: os.settings.changes.handler(({input, signal}) =>
        deps.settings.file(input.scope, input.namespace).changes(signal),
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
        const gate: RegistryCallGate = async (run) => {
          await admitOutsideCall(deps, context, context.session, signal, path.join('.'))
          await refuseUnapproved(deps, input.name, input.input, {context, errors, signal})
          return hubTraced(context, input.name, input.input, run)
        }
        const call = (): Promise<unknown> =>
          assist === undefined
            ? context.session.tools.call(input.name, input.input, {signal, gate})
            : gate(() => assist.execute(input.input))
        return call().catch((error: unknown) => {
          throw registryCallError(error, errors)
        })
      }),
    },
    captures: {
      list: os.captures.list.handler(({input}) => deps.runtime.forSession(input.sessionId).captures.list()),
    },
    page: {
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
          harness: harnessMetaOf(harness),
        }
      }),
      harnesses: os.meta.harnesses.handler(async () => ({
        harnesses: await Promise.all(chat.harnesses.map(harnessMenuEntryOf)),
        defaultHarness: chat.defaultHarness.id,
      })),
      commands: os.meta.commands.handler(({input, context}) =>
        listCommands(chat, {sessionId: input.sessionId, origin: context.origin}),
      ),
      tools: os.meta.tools.handler(() => ({tools: deps.tools})),
      engine: os.meta.engine.handler(() => engine.staleness()),
      hubAgents: os.meta.hubAgents.handler(() => ({
        installs: deps.hub.installs(),
        connections: deps.hub.connections(),
      })),
      connectHub: os.meta.connectHub.handler(({input}) => deps.hub.connect(input.harness)),
      disconnectHub: os.meta.disconnectHub.handler(({input}) => deps.hub.disconnect(input.harness)),
    },
  })
}
