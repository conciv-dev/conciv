import {defineTool, toolError} from '@conciv/extension'
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

export const routerStateServer = defineTool(routerStateDef).server((_input, ctx: ToolCtx) =>
  ctx.adapter.client.routes.current(),
)

export const routeTreeServer = defineTool(routeTreeDef).server((_input, ctx: ToolCtx) =>
  ctx.adapter.client.routes.tree(),
)

export const loaderDataServer = defineTool(loaderDataDef).server(async (input, ctx: ToolCtx) => {
  if (input.routeId !== undefined) return ctx.adapter.client.data.get(input.routeId)
  const {matches} = await ctx.adapter.client.routes.current()
  const leaf = matches.at(-1)
  if (!leaf) return null
  return ctx.adapter.client.data.get(leaf.routeId)
})

export const queryCacheServer = defineTool(queryCacheDef).server(async (_input, ctx: ToolCtx) => {
  const queryCache = ctx.adapter.queryCache
  if (!queryCache) return {queries: [], mutations: []}
  const [queries, mutations] = await Promise.all([queryCache.queries(), queryCache.mutations()])
  return {queries, mutations}
})

export const navigateServer = defineTool(navigateDef).server(async (input, ctx: ToolCtx) => {
  await ctx.adapter.client.navigation.navigate({to: input.to, replace: input.replace})
  return {ok: true, to: input.to}
})

export const routerInvalidateServer = defineTool(routerInvalidateDef).server(async (_input, ctx: ToolCtx) => {
  await ctx.adapter.client.navigation.refresh()
  return {ok: true}
})

export const backServer = defineTool(backDef).server(async (_input, ctx: ToolCtx) => {
  await ctx.adapter.client.navigation.back()
  return {ok: true}
})

export const queryInvalidateServer = defineTool(queryInvalidateDef).server(async (input, ctx: ToolCtx) => {
  await ctx.adapter.queryCache?.invalidate(input.key)
  return {ok: true}
})

export const queryRefetchServer = defineTool(queryRefetchDef).server(async (input, ctx: ToolCtx) => {
  await ctx.adapter.queryCache?.refetch(input.key)
  return {ok: true}
})

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
