import {defineTool, toolError} from '@conciv/extension'
import type {FrameworkAdapter} from '@conciv/protocol/framework-types'
import type {ServerToolRegistryAccess} from '@conciv/extension/registry'
import {
  backDef,
  buildErrorsDef,
  loaderDataDef,
  navigateDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  routeManifestDef,
  routeTreeDef,
  routerInvalidateDef,
  routerStateDef,
  serverFnTraceDef,
} from './def.js'

type ToolCtx = {makeAdapter: (tools: ServerToolRegistryAccess) => FrameworkAdapter}

export const routerStateServer = defineTool(routerStateDef).server((_input, ctx: ToolCtx, _request, _page, tools) =>
  ctx.makeAdapter(tools).client.routes.current(),
)

export const routeTreeServer = defineTool(routeTreeDef).server((_input, ctx: ToolCtx, _request, _page, tools) =>
  ctx.makeAdapter(tools).client.routes.tree(),
)

export const loaderDataServer = defineTool(loaderDataDef).server(
  async (input, ctx: ToolCtx, _request, _page, tools) => {
    const adapter = ctx.makeAdapter(tools)
    if (input.routeId !== undefined) return adapter.client.data.get(input.routeId)
    const {matches} = await adapter.client.routes.current()
    const leaf = matches.at(-1)
    if (!leaf) return null
    return adapter.client.data.get(leaf.routeId)
  },
)

export const queryCacheServer = defineTool(queryCacheDef).server(
  async (_input, ctx: ToolCtx, _request, _page, tools) => {
    const queryCache = ctx.makeAdapter(tools).queryCache
    if (!queryCache) return {queries: [], mutations: []}
    const [queries, mutations] = await Promise.all([queryCache.queries(), queryCache.mutations()])
    return {queries, mutations}
  },
)

export const navigateServer = defineTool(navigateDef).server(async (input, ctx: ToolCtx, _request, _page, tools) => {
  await ctx.makeAdapter(tools).client.navigation.navigate({to: input.to, replace: input.replace})
  return {ok: true, to: input.to}
})

export const routerInvalidateServer = defineTool(routerInvalidateDef).server(
  async (_input, ctx: ToolCtx, _request, _page, tools) => {
    await ctx.makeAdapter(tools).client.navigation.refresh()
    return {ok: true}
  },
)

export const backServer = defineTool(backDef).server(async (_input, ctx: ToolCtx, _request, _page, tools) => {
  await ctx.makeAdapter(tools).client.navigation.back()
  return {ok: true}
})

export const queryInvalidateServer = defineTool(queryInvalidateDef).server(
  async (input, ctx: ToolCtx, _request, _page, tools) => {
    await ctx.makeAdapter(tools).queryCache?.invalidate(input.key)
    return {ok: true}
  },
)

export const queryRefetchServer = defineTool(queryRefetchDef).server(
  async (input, ctx: ToolCtx, _request, _page, tools) => {
    await ctx.makeAdapter(tools).queryCache?.refetch(input.key)
    return {ok: true}
  },
)

export const buildErrorsServer = defineTool(buildErrorsDef).server((_input, ctx: ToolCtx, _request, _page, tools) =>
  ctx.makeAdapter(tools).server.errors.snapshot(),
)

export const routeManifestServer = defineTool(routeManifestDef).server(
  async (_input, ctx: ToolCtx, _request, _page, tools) => {
    try {
      return await ctx.makeAdapter(tools).server.manifest.routes()
    } catch (error) {
      throw toolError('MANIFEST_UNREADABLE', {message: error instanceof Error ? error.message : String(error)})
    }
  },
)

export const serverFnTraceServer = defineTool(serverFnTraceDef).server(
  async (input, ctx: ToolCtx, _request, _page, tools) => {
    const adapter = ctx.makeAdapter(tools)
    if (!adapter.serverFunctions) return {traces: [], functions: []}
    const [traces, functions] = await Promise.all([
      adapter.serverFunctions.traces(input.count ?? Number.MAX_SAFE_INTEGER),
      adapter.serverFunctions.list(),
    ])
    return {traces, functions}
  },
)
