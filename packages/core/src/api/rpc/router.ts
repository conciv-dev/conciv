import {z} from 'zod'
import {asc, eq} from 'drizzle-orm'
import {
  isPageFailure,
  OpenSourceResultSchema,
  OpenSourceSchema,
  PAGE_QUERY_FUNCTION,
  SymbolicateSchema,
  type PageErrorCode,
} from '@conciv/protocol/page-types'
import {SessionCapturesSchema} from '@conciv/protocol/element-capture-types'
import type {DevframeNodeContext} from 'devframe/types'
import {isPageVerbError} from '@conciv/extension'
import {resolveHarnessModels} from '@conciv/harness'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOL} from '@conciv/tools/builtins'
import {drafts, markers} from '@conciv/db'
import {
  DraftsGetOutputSchema,
  DraftsSetInputSchema,
  EditorOpenInputSchema,
  EngineStalenessSchema,
  MarkersListOutputSchema,
  NavigationGetOutputSchema,
  NavigationSetOutputSchema,
  OkSchema,
  PageChangesOutputSchema,
  PageSymbolicateOutputSchema,
  RegistryCallInputSchema,
  RegistryCallOutputSchema,
  RegistryCatalogOutputSchema,
  registryCallErrors,
  serverErrors,
  ServerGraphInputSchema,
  ServerGraphOutputSchema,
  ServerReloadInputSchema,
  ServerResolveInputSchema,
  ServerResolveOutputSchema,
  ServerRestartInputSchema,
  ServerTransformInputSchema,
  ServerTransformOutputSchema,
  ServerUrlsOutputSchema,
  SessionIdInputSchema,
  type RegistryCallErrorName,
} from '@conciv/contract'
import {BundlerConfigSchema} from '@conciv/protocol/bundler-types'
import {concivError, defineConcivFunction} from '@conciv/extension/devframe-function'
import {
  ChatCommandsSchema,
  ChatModelsSchema,
  ChatToolsSchema,
  NavigationWriteSchema,
  SessionId,
  type NavigationWrite,
} from '@conciv/protocol/chat-types'
import {widgetCaller} from '../../lib/cors.js'
import {listCommands, mcpUrlFor} from '../../sessions/commands.js'
import {session} from '../../runtime/session-context.js'
import {chatRouter} from './chat.js'
import {harnessMetaOf, sessionsRouter} from './sessions.js'
import {definedErrors, makeSessionOs, os, type RpcDeps, type SessionOs} from './mount.js'
import {isBrowserCaller} from '../../devframe-trust.js'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import type {ServerFunctionsOf} from '../../devframe-plane.js'
import type {PageTab, PageTabs} from '../../page-bus.js'

export const PAGE_ERROR_NAME = {
  'no-widget': 'NO_PAGE_CLIENT',
  timeout: 'PAGE_TIMEOUT',
  'unknown-verb': 'UNKNOWN_TOOL',
  'invalid-args': 'INVALID_ARGS',
  'handler-error': 'HANDLER_ERROR',
} as const satisfies Record<PageErrorCode, RegistryCallErrorName>

type GatedDeps = Pick<RpcDeps, 'runtime' | 'chat'>
type GatedCall = {name: string; input: unknown; browser: boolean}
type ServerTool<Output extends z.ZodType> = {name: string; outputSchema?: Output}

function registryCallError(error: unknown): Error {
  if (isPageVerbError(error)) return concivError(PAGE_ERROR_NAME[error.code], error.message)
  if (isPageFailure(error)) return concivError(PAGE_ERROR_NAME[error.error.code], error.error.message)
  return error instanceof Error ? error : new Error(String(error))
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function callTool<Output extends z.ZodType>(tool: ServerTool<Output>, input: unknown): Promise<z.output<Output>> {
  const output = tool.outputSchema
  if (output === undefined) throw new Error(`tool "${tool.name}" declares no output schema`)
  return output.parse(await session().tools.call(tool.name, input))
}

async function serverTool<Output extends z.ZodType>(
  tool: ServerTool<Output>,
  input: unknown,
): Promise<z.output<Output>> {
  try {
    return await callTool(tool, input)
  } catch (error) {
    if (hasErrorCode(error, 'NO_BUNDLER')) throw concivError('NO_BUNDLER', serverErrors.NO_BUNDLER.message)
    throw error
  }
}

async function refuseUnapproved(deps: GatedDeps, call: GatedCall): Promise<void> {
  if (call.browser) return
  const asks = deps.runtime.engine.catalog().find((tool) => tool.name === call.name)?.approval === 'ask'
  if (!asks) return
  const scope = session()
  const refusal = await deps.chat.plane.admitCall(scope.id, call.name, call.input, scope.stream.publish)
  if (refusal !== null) throw concivError('APPROVAL_DENIED', refusal)
}

function registryActions(deps: GatedDeps) {
  return {
    catalog: () => deps.runtime.engine.catalog(),
    call: async (input: z.infer<typeof RegistryCallInputSchema>, browser: boolean) => {
      const tools = session().tools
      if (!tools.has(input.name)) throw concivError('UNKNOWN_TOOL', registryCallErrors.UNKNOWN_TOOL.message)
      await refuseUnapproved(deps, {name: input.name, input: input.input, browser})
      try {
        return await tools.call(input.name, input.input)
      } catch (error) {
        throw registryCallError(error)
      }
    },
  }
}

function serverActions(deps: GatedDeps) {
  const gated = async <Output extends z.ZodType>(tool: ServerTool<Output>, input: unknown, browser: boolean) => {
    await refuseUnapproved(deps, {name: tool.name, input, browser})
    return serverTool(tool, input)
  }
  return {
    config: () => serverTool(BUILTIN_SERVER_TOOL.server_config, {}),
    resolve: (input: z.infer<typeof ServerResolveInputSchema>) => serverTool(BUILTIN_SERVER_TOOL.server_resolve, input),
    graph: (input: z.infer<typeof ServerGraphInputSchema>) => serverTool(BUILTIN_SERVER_TOOL.server_graph, input),
    transform: (input: z.infer<typeof ServerTransformInputSchema>) =>
      serverTool(BUILTIN_SERVER_TOOL.server_transform, input),
    urls: () => serverTool(BUILTIN_SERVER_TOOL.server_urls, {}),
    reload: (input: z.infer<typeof ServerReloadInputSchema>, browser: boolean) =>
      gated(BUILTIN_SERVER_TOOL.server_reload, input, browser),
    restart: (input: z.infer<typeof ServerRestartInputSchema>, browser: boolean) =>
      gated(BUILTIN_SERVER_TOOL.server_restart, input, browser),
  }
}

function widgetCalled(deps: RpcDeps, context: RpcContext): boolean {
  return widgetCaller(context.callerOrigin, deps.allowedOrigins)
}

function registryRouter(deps: RpcDeps, sessionOs: SessionOs) {
  const actions = registryActions(deps)
  return {
    catalog: os.registry.catalog.handler(() => actions.catalog()),
    call: sessionOs.registry.call.handler(({input, context, errors}) =>
      definedErrors(actions.call(input, widgetCalled(deps, context)), errors),
    ),
  }
}

function serverRouter(deps: RpcDeps, sessionOs: SessionOs) {
  const actions = serverActions(deps)
  return {
    config: sessionOs.server.config.handler(({errors}) => definedErrors(actions.config(), errors)),
    resolve: sessionOs.server.resolve.handler(({input, errors}) => definedErrors(actions.resolve(input), errors)),
    graph: sessionOs.server.graph.handler(({input, errors}) => definedErrors(actions.graph(input), errors)),
    transform: sessionOs.server.transform.handler(({input, errors}) => definedErrors(actions.transform(input), errors)),
    urls: sessionOs.server.urls.handler(({errors}) => definedErrors(actions.urls(), errors)),
    reload: sessionOs.server.reload.handler(({input, context, errors}) =>
      definedErrors(actions.reload(input, widgetCalled(deps, context)), errors),
    ),
    restart: sessionOs.server.restart.handler(({input, context, errors}) =>
      definedErrors(actions.restart(input, widgetCalled(deps, context)), errors),
    ),
  }
}

export function registryFunctions(deps: GatedDeps) {
  const actions = registryActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:registry:catalog',
      type: 'query',
      input: z.object({}),
      output: RegistryCatalogOutputSchema,
      handler: actions.catalog,
    }),
    defineConcivFunction({
      name: 'conciv:registry:call',
      type: 'action',
      session: true,
      input: RegistryCallInputSchema,
      output: RegistryCallOutputSchema,
      handler: (input, call) => actions.call(input, isBrowserCaller(call.ctx)),
    }),
  ]
}

export function serverFunctions(deps: GatedDeps) {
  const actions = serverActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:server:config',
      type: 'query',
      session: true,
      input: z.object({}).loose(),
      output: BundlerConfigSchema,
      handler: actions.config,
    }),
    defineConcivFunction({
      name: 'conciv:server:resolve',
      type: 'query',
      session: true,
      input: ServerResolveInputSchema,
      output: ServerResolveOutputSchema,
      handler: actions.resolve,
    }),
    defineConcivFunction({
      name: 'conciv:server:graph',
      type: 'query',
      session: true,
      input: ServerGraphInputSchema,
      output: ServerGraphOutputSchema,
      handler: actions.graph,
    }),
    defineConcivFunction({
      name: 'conciv:server:transform',
      type: 'query',
      session: true,
      input: ServerTransformInputSchema,
      output: ServerTransformOutputSchema,
      handler: actions.transform,
    }),
    defineConcivFunction({
      name: 'conciv:server:urls',
      type: 'query',
      session: true,
      input: z.object({}).loose(),
      output: ServerUrlsOutputSchema,
      handler: actions.urls,
    }),
    defineConcivFunction({
      name: 'conciv:server:reload',
      type: 'action',
      session: true,
      input: ServerReloadInputSchema,
      output: OkSchema,
      handler: (input, call) => actions.reload(input, isBrowserCaller(call.ctx)),
    }),
    defineConcivFunction({
      name: 'conciv:server:restart',
      type: 'action',
      session: true,
      input: ServerRestartInputSchema,
      output: OkSchema,
      handler: (input, call) => actions.restart(input, isBrowserCaller(call.ctx)),
    }),
  ]
}

export type RegistryServerFunctions = ServerFunctionsOf<ReturnType<typeof registryFunctions>>
export type ServerServerFunctions = ServerFunctionsOf<ReturnType<typeof serverFunctions>>

export function makeRpcRouter(deps: RpcDeps) {
  const sessionOs = makeSessionOs(deps)
  return os.router({
    sessions: sessionsRouter(deps),
    chat: chatRouter(deps, sessionOs),
    drafts: draftsRouter(deps),
    markers: markersRouter(deps),
    navigation: navigationRouter(deps),
    registry: registryRouter(deps, sessionOs),
    captures: capturesRouter(deps),
    page: pageRouter(deps, sessionOs),
    server: serverRouter(deps, sessionOs),
    editor: editorRouter(deps, sessionOs),
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

type NavigationDeps = Pick<RpcDeps, 'runtime'>

function navigationActions(deps: NavigationDeps) {
  const navigation = deps.runtime.engine.navigation
  return {
    get: () => navigation.get(),
    set: (input: NavigationWrite) => navigation.set(input),
  }
}

function navigationRouter(deps: NavigationDeps) {
  const actions = navigationActions(deps)
  return {
    get: os.navigation.get.handler(() => actions.get()),
    set: os.navigation.set.handler(({input}) => actions.set(input)),
  }
}

export function navigationFunctions(deps: NavigationDeps) {
  const actions = navigationActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:navigation:get',
      type: 'query',
      input: z.object({}),
      output: NavigationGetOutputSchema,
      handler: actions.get,
    }),
    defineConcivFunction({
      name: 'conciv:navigation:set',
      type: 'action',
      input: NavigationWriteSchema,
      output: NavigationSetOutputSchema,
      handler: actions.set,
    }),
  ]
}

export type NavigationServerFunctions = ServerFunctionsOf<ReturnType<typeof navigationFunctions>>

type EditorDeps = Pick<RpcDeps, 'openFromFrames'>

function editorActions(deps: EditorDeps) {
  return {
    open: async (input: z.infer<typeof EditorOpenInputSchema>) =>
      OkSchema.parse(await callTool(BUILTIN_OPEN_TOOL, input)),
    openFromFrames: (input: z.infer<typeof OpenSourceSchema>) => deps.openFromFrames(input.frames),
  }
}

function editorRouter(deps: EditorDeps, sessionOs: SessionOs) {
  const actions = editorActions(deps)
  return {
    open: sessionOs.editor.open.handler(({input}) => actions.open(input)),
    openFromFrames: os.editor.openFromFrames.handler(({input}) => actions.openFromFrames(input)),
  }
}

export function editorFunctions(deps: EditorDeps) {
  const actions = editorActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:editor:open',
      type: 'action',
      session: true,
      input: EditorOpenInputSchema,
      output: OkSchema,
      handler: actions.open,
    }),
    defineConcivFunction({
      name: 'conciv:editor:openFromFrames',
      type: 'action',
      input: OpenSourceSchema,
      output: OpenSourceResultSchema,
      handler: actions.openFromFrames,
    }),
  ]
}

export type EditorServerFunctions = ServerFunctionsOf<ReturnType<typeof editorFunctions>>

type RuntimeDeps = Pick<RpcDeps, 'runtime'>

function capturesActions(deps: RuntimeDeps) {
  return {
    list: (input: SessionIdInput) => deps.runtime.forSession(input.sessionId).captures.list(),
  }
}

function capturesRouter(deps: RuntimeDeps) {
  const actions = capturesActions(deps)
  return {
    list: os.captures.list.handler(({input}) => actions.list(input)),
  }
}

export function capturesFunctions(deps: RuntimeDeps) {
  const actions = capturesActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:captures:list',
      type: 'query',
      input: SessionIdInputSchema,
      output: SessionCapturesSchema,
      handler: actions.list,
    }),
  ]
}

export type CapturesServerFunctions = ServerFunctionsOf<ReturnType<typeof capturesFunctions>>

function pageActions(deps: RuntimeDeps) {
  return {
    symbolicate: (input: z.infer<typeof SymbolicateSchema>) => deps.runtime.engine.symbolicate(input.frames),
    changes: (sessionId: SessionId) => deps.runtime.forSession(sessionId).page.changes(),
    clearChanges: async (sessionId: SessionId) => {
      await deps.runtime.forSession(sessionId).page.clearChanges()
      return {ok: true as const}
    },
  }
}

function pageRouter(deps: RuntimeDeps, sessionOs: SessionOs) {
  const actions = pageActions(deps)
  return {
    symbolicate: os.page.symbolicate.handler(({input}) => actions.symbolicate(input)),
    changes: sessionOs.page.changes.handler(({context}) => actions.changes(context.session.id)),
    clearChanges: sessionOs.page.clearChanges.handler(({context}) => actions.clearChanges(context.session.id)),
  }
}

const PageJoinedSchema = z.object({joined: SessionId})

function socketOpen(peer: object): boolean {
  if (!('websocket' in peer)) return false
  const socket = peer.websocket
  return typeof socket === 'object' && socket !== null && 'readyState' in socket && socket.readyState === WebSocket.OPEN
}

function joiningTab(ctx: DevframeNodeContext): PageTab {
  const caller = ctx.rpc.getCurrentRpcSession()
  const peer = caller?.meta.peer
  if (caller === undefined || peer === undefined || caller.meta.isTrusted !== true)
    throw concivError('BAD_REQUEST', 'a page joins over a trusted websocket hub connection')
  return {
    id: caller.meta.id,
    live: () => caller.meta.isTrusted === true && socketOpen(peer),
    query: (query) => caller.rpc.$call(PAGE_QUERY_FUNCTION, query),
  }
}

export function pageFunctions(deps: RuntimeDeps & {tabs: PageTabs}) {
  const actions = pageActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:page:symbolicate',
      type: 'query',
      input: SymbolicateSchema,
      output: PageSymbolicateOutputSchema,
      handler: actions.symbolicate,
    }),
    defineConcivFunction({
      name: 'conciv:page:changes',
      type: 'query',
      session: true,
      input: z.object({}).loose(),
      output: PageChangesOutputSchema,
      handler: (_input, call) => actions.changes(call.sessionId),
    }),
    defineConcivFunction({
      name: 'conciv:page:clearChanges',
      type: 'action',
      session: true,
      input: z.object({}).loose(),
      output: OkSchema,
      handler: (_input, call) => actions.clearChanges(call.sessionId),
    }),
    defineConcivFunction({
      name: 'conciv:page:join',
      type: 'action',
      input: SessionIdInputSchema,
      output: PageJoinedSchema,
      handler: (input, call) => {
        deps.tabs.join(input.sessionId, joiningTab(call.ctx))
        return {joined: input.sessionId}
      },
    }),
    defineConcivFunction({
      name: 'conciv:page:leave',
      type: 'action',
      input: SessionIdInputSchema,
      output: OkSchema,
      handler: (input, call) => {
        deps.tabs.leave(input.sessionId, joiningTab(call.ctx).id)
        return {ok: true as const}
      },
    }),
  ]
}

export type PageServerFunctions = ServerFunctionsOf<ReturnType<typeof pageFunctions>>
