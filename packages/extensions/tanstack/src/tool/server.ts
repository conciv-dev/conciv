import {defineTool, toolError, type ToolRequest} from '@conciv/extension'
import type {FrameworkAdapter} from '@conciv/protocol/framework-types'
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

type ToolCtx = {adapter: FrameworkAdapter}

export const routerStateServer = defineTool(routerStateDef).server((_input, ctx: ToolCtx, request: ToolRequest) =>
  ctx.adapter.client.routes.current(request.sessionId),
)

export const routeTreeServer = defineTool(routeTreeDef).server((_input, ctx: ToolCtx, request: ToolRequest) =>
  ctx.adapter.client.routes.tree(request.sessionId),
)

export const loaderDataServer = defineTool(loaderDataDef).server(async (input, ctx: ToolCtx, request: ToolRequest) => {
  if (input.routeId !== undefined) return ctx.adapter.client.data.get(request.sessionId, input.routeId)
  const {matches} = await ctx.adapter.client.routes.current(request.sessionId)
  const leaf = matches.at(-1)
  if (!leaf) return null
  return ctx.adapter.client.data.get(request.sessionId, leaf.routeId)
})

export const queryCacheServer = defineTool(queryCacheDef).server(async (_input, ctx: ToolCtx, request: ToolRequest) => {
  const queryCache = ctx.adapter.queryCache
  if (!queryCache) return {queries: [], mutations: []}
  const [queries, mutations] = await Promise.all([
    queryCache.queries(request.sessionId),
    queryCache.mutations(request.sessionId),
  ])
  return {queries, mutations}
})

export const navigateServer = defineTool(navigateDef).server(async (input, ctx: ToolCtx, request: ToolRequest) => {
  await ctx.adapter.client.navigation.navigate(request.sessionId, {to: input.to, replace: input.replace})
  return {ok: true, to: input.to}
})

export const routerInvalidateServer = defineTool(routerInvalidateDef).server(
  async (_input, ctx: ToolCtx, request: ToolRequest) => {
    await ctx.adapter.client.navigation.refresh(request.sessionId)
    return {ok: true}
  },
)

export const backServer = defineTool(backDef).server(async (_input, ctx: ToolCtx, request: ToolRequest) => {
  await ctx.adapter.client.navigation.back(request.sessionId)
  return {ok: true}
})

export const queryInvalidateServer = defineTool(queryInvalidateDef).server(
  async (input, ctx: ToolCtx, request: ToolRequest) => {
    await ctx.adapter.queryCache?.invalidate(request.sessionId, input.key)
    return {ok: true}
  },
)

export const queryRefetchServer = defineTool(queryRefetchDef).server(
  async (input, ctx: ToolCtx, request: ToolRequest) => {
    await ctx.adapter.queryCache?.refetch(request.sessionId, input.key)
    return {ok: true}
  },
)

export const buildErrorsServer = defineTool(buildErrorsDef).server((_input, ctx: ToolCtx) =>
  ctx.adapter.server.errors.snapshot(),
)

export const routeManifestServer = defineTool(routeManifestDef).server(async (_input, ctx: ToolCtx) => {
  try {
    return await ctx.adapter.server.manifest.routes()
  } catch (error) {
    throw toolError('MANIFEST_UNREADABLE', {message: error instanceof Error ? error.message : String(error)})
  }
})

export const serverFnTraceServer = defineTool(serverFnTraceDef).server(async (input, ctx: ToolCtx) => {
  if (!ctx.adapter.serverFunctions) return {traces: [], functions: []}
  const [traces, functions] = await Promise.all([
    ctx.adapter.serverFunctions.traces(input.count ?? Number.MAX_SAFE_INTEGER),
    ctx.adapter.serverFunctions.list(),
  ])
  return {traces, functions}
})
