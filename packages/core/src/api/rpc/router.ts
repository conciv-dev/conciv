import {z} from 'zod'
import {asc, eq} from 'drizzle-orm'
import {isPageFailure, type PageErrorCode} from '@conciv/protocol/page-types'
import {isPageVerbError} from '@conciv/extension'
import {resolveHarnessModels} from '@conciv/harness'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOL} from '@conciv/tools/builtins'
import {drafts, markers} from '@conciv/db'
import {
  DraftsGetOutputSchema,
  DraftsSetInputSchema,
  EngineStalenessSchema,
  MarkersListOutputSchema,
  OkSchema,
  SessionIdInputSchema,
  type RegistryCallErrorName,
} from '@conciv/contract'
import {defineConcivFunction} from '@conciv/extension/devframe-function'
import {ChatCommandsSchema, ChatModelsSchema, ChatToolsSchema} from '@conciv/protocol/chat-types'
import {widgetCaller} from '../../lib/cors.js'
import {listCommands, mcpUrlFor} from '../../sessions/commands.js'
import {session} from '../../runtime/session-context.js'
import {chatRouter} from './chat.js'
import {harnessMetaOf, sessionsRouter} from './sessions.js'
import {makeSessionOs, os, type RpcDeps} from './mount.js'
import type {SessionScope} from '../../runtime/scope-types.js'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import type {ServerFunctionsOf} from '../../devframe-plane.js'

export const PAGE_ERROR_NAME = {
  'no-widget': 'NO_PAGE_CLIENT',
  timeout: 'PAGE_TIMEOUT',
  'unknown-verb': 'UNKNOWN_TOOL',
  'invalid-args': 'INVALID_ARGS',
  'handler-error': 'HANDLER_ERROR',
} as const satisfies Record<PageErrorCode, RegistryCallErrorName>

type RegistryErrors = Record<RegistryCallErrorName, (options: {message: string}) => Error>
type BundlerErrors = {NO_BUNDLER: () => Error}
type ApprovalErrors = {APPROVAL_DENIED: (options: {message: string}) => Error}
type GatedCall = {context: RpcContext & {session: SessionScope}; errors: ApprovalErrors}

function registryCallError(error: unknown, errors: RegistryErrors): Error {
  if (isPageVerbError(error)) return errors[PAGE_ERROR_NAME[error.code]]({message: error.message})
  if (isPageFailure(error)) return errors[PAGE_ERROR_NAME[error.error.code]]({message: error.error.message})
  return error instanceof Error ? error : new Error(String(error))
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
  const refusal = await deps.chat.plane.admitCall(scope.id, name, input, scope.stream.publish)
  if (refusal !== null) throw call.errors.APPROVAL_DENIED({message: refusal})
}

export function makeRpcRouter(deps: RpcDeps) {
  const engine = deps.runtime.engine
  const sessionOs = makeSessionOs(deps)
  return os.router({
    sessions: sessionsRouter(deps),
    chat: chatRouter(deps, sessionOs),
    drafts: draftsRouter(deps),
    markers: markersRouter(deps),
    navigation: {
      get: os.navigation.get.handler(() => engine.navigation.get()),
      set: os.navigation.set.handler(({input}) => engine.navigation.set(input)),
    },
    registry: {
      catalog: os.registry.catalog.handler(() => engine.catalog()),
      call: sessionOs.registry.call.handler(async ({input, context, errors}) => {
        if (!context.session.tools.has(input.name)) throw errors.UNKNOWN_TOOL()
        await refuseUnapproved(deps, input.name, input.input, {context, errors})
        try {
          return await context.session.tools.call(input.name, input.input)
        } catch (error) {
          throw registryCallError(error, errors)
        }
      }),
    },
    captures: {
      list: os.captures.list.handler(({input}) => deps.runtime.forSession(input.sessionId).captures.list()),
    },
    page: {
      symbolicate: os.page.symbolicate.handler(({input}) => engine.symbolicate(input.frames)),
      changes: sessionOs.page.changes.handler(({context}) => context.session.page.changes()),
      clearChanges: sessionOs.page.clearChanges.handler(async ({context}) => {
        await context.session.page.clearChanges()
        return {ok: true as const}
      }),
      queries: sessionOs.page.queries.handler(({context, signal}) =>
        context.session.page.queries(signal ?? new AbortController().signal),
      ),
      reply: sessionOs.page.reply.handler(({input, context, errors}) => {
        if (!context.session.page.reply(input.requestId, input.outcome)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    server: {
      config: sessionOs.server.config.handler(({errors}) => callTool(BUILTIN_SERVER_TOOL.server_config, {}, errors)),
      resolve: sessionOs.server.resolve.handler(({input, errors}) =>
        callTool(BUILTIN_SERVER_TOOL.server_resolve, input, errors),
      ),
      graph: sessionOs.server.graph.handler(({input, errors}) =>
        callTool(BUILTIN_SERVER_TOOL.server_graph, input, errors),
      ),
      transform: sessionOs.server.transform.handler(({input, errors}) =>
        callTool(BUILTIN_SERVER_TOOL.server_transform, input, errors),
      ),
      urls: sessionOs.server.urls.handler(({errors}) => callTool(BUILTIN_SERVER_TOOL.server_urls, {}, errors)),
      reload: sessionOs.server.reload.handler(async ({input, context, errors}) => {
        await refuseUnapproved(deps, BUILTIN_SERVER_TOOL.server_reload.name, input, {context, errors})
        return callTool(BUILTIN_SERVER_TOOL.server_reload, input, errors)
      }),
      restart: sessionOs.server.restart.handler(async ({input, context, errors}) => {
        await refuseUnapproved(deps, BUILTIN_SERVER_TOOL.server_restart.name, input, {context, errors})
        return callTool(BUILTIN_SERVER_TOOL.server_restart, input, errors)
      }),
    },
    editor: {
      open: sessionOs.editor.open.handler(({input}) => callTool(BUILTIN_OPEN_TOOL, input)),
      openFromFrames: os.editor.openFromFrames.handler(({input}) => deps.openFromFrames(input.frames)),
    },
    meta: metaRouter(deps),
  })
}

type MetaDeps = Pick<RpcDeps, 'chat' | 'tools' | 'runtime'>

function metaActions(deps: MetaDeps) {
  const chat = deps.chat
  return {
    models: async () => {
      const models = await resolveHarnessModels(chat.harness)
      return {
        models,
        defaultModel: chat.harness.defaultModel ?? models[0]?.id ?? null,
        harness: harnessMetaOf(deps),
      }
    },
    commands: (input: z.infer<typeof SessionIdInputSchema>, mcpUrl: string | undefined) =>
      listCommands(chat, {sessionId: input.sessionId, mcpUrl}),
    tools: () => ({tools: deps.tools}),
    engine: () => deps.runtime.engine.staleness(),
  }
}

function metaRouter(deps: MetaDeps) {
  const actions = metaActions(deps)
  return {
    models: os.meta.models.handler(() => actions.models()),
    commands: os.meta.commands.handler(({input, context}) =>
      actions.commands(input, mcpUrlFor(deps.chat, context.origin)),
    ),
    tools: os.meta.tools.handler(() => actions.tools()),
    engine: os.meta.engine.handler(() => actions.engine()),
  }
}

export function metaFunctions(deps: MetaDeps & {mcpUrl: () => string | undefined}) {
  const actions = metaActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:meta:models',
      type: 'query',
      input: z.object({}),
      output: ChatModelsSchema,
      handler: actions.models,
    }),
    defineConcivFunction({
      name: 'conciv:meta:commands',
      type: 'query',
      input: SessionIdInputSchema,
      output: ChatCommandsSchema,
      handler: (input) => actions.commands(input, deps.mcpUrl()),
    }),
    defineConcivFunction({
      name: 'conciv:meta:tools',
      type: 'query',
      input: z.object({}),
      output: ChatToolsSchema,
      handler: actions.tools,
    }),
    defineConcivFunction({
      name: 'conciv:meta:engine',
      type: 'query',
      input: z.object({}),
      output: EngineStalenessSchema,
      handler: actions.engine,
    }),
  ]
}

export type MetaServerFunctions = ServerFunctionsOf<ReturnType<typeof metaFunctions>>

type StoreDeps = Pick<RpcDeps, 'chat'>
type SessionIdInput = z.infer<typeof SessionIdInputSchema>

function draftsActions(deps: StoreDeps) {
  const db = deps.chat.db
  return {
    get: async (input: SessionIdInput) => {
      const rows = await db.select().from(drafts).where(eq(drafts.sessionId, input.sessionId))
      return rows[0] ?? null
    },
    set: async (input: z.infer<typeof DraftsSetInputSchema>) => {
      const row = {...input, updatedAt: Date.now()}
      await db.insert(drafts).values(row).onConflictDoUpdate({target: drafts.sessionId, set: row})
      return {ok: true as const}
    },
  }
}

function markersActions(deps: StoreDeps) {
  const db = deps.chat.db
  return {
    list: (input: SessionIdInput) =>
      db.select().from(markers).where(eq(markers.sessionId, input.sessionId)).orderBy(asc(markers.afterTurn)),
  }
}

function draftsRouter(deps: StoreDeps) {
  const actions = draftsActions(deps)
  return {
    get: os.drafts.get.handler(({input}) => actions.get(input)),
    set: os.drafts.set.handler(({input}) => actions.set(input)),
  }
}

function markersRouter(deps: StoreDeps) {
  const actions = markersActions(deps)
  return {
    list: os.markers.list.handler(({input}) => actions.list(input)),
  }
}

export function draftsFunctions(deps: StoreDeps) {
  const actions = draftsActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:drafts:get',
      type: 'query',
      input: SessionIdInputSchema,
      output: DraftsGetOutputSchema,
      handler: actions.get,
    }),
    defineConcivFunction({
      name: 'conciv:drafts:set',
      type: 'action',
      input: DraftsSetInputSchema,
      output: OkSchema,
      handler: actions.set,
    }),
  ]
}

export function markersFunctions(deps: StoreDeps) {
  const actions = markersActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:markers:list',
      type: 'query',
      input: SessionIdInputSchema,
      output: MarkersListOutputSchema,
      handler: actions.list,
    }),
  ]
}

export type DraftsServerFunctions = ServerFunctionsOf<ReturnType<typeof draftsFunctions>>
export type MarkersServerFunctions = ServerFunctionsOf<ReturnType<typeof markersFunctions>>
