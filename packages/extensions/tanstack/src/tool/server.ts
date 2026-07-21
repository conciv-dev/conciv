import {defineTool} from '@conciv/extension'
import type {FrameworkAdapter} from '@conciv/protocol/framework-types'
import {
  BackInput,
  BuildErrorsInput,
  LoaderDataInput,
  NavigateInput,
  QueryCacheInput,
  QueryInvalidateInput,
  QueryRefetchInput,
  RouteManifestInput,
  RouteTreeInput,
  RouterInvalidateInput,
  RouterStateInput,
  ServerFnTraceInput,
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

export const routerStateServer = defineTool<typeof RouterStateInput, ToolCtx>(routerStateDef).server((_input, ctx) =>
  ctx.adapter.client.routes.current(),
)

export const routeTreeServer = defineTool<typeof RouteTreeInput, ToolCtx>(routeTreeDef).server((_input, ctx) =>
  ctx.adapter.client.routes.tree(),
)

export const loaderDataServer = defineTool<typeof LoaderDataInput, ToolCtx>(loaderDataDef).server(
  async (input, ctx) => {
    if (input.routeId !== undefined) return ctx.adapter.client.data.get(input.routeId)
    const {matches} = await ctx.adapter.client.routes.current()
    const leaf = matches.at(-1)
    if (!leaf) return null
    return ctx.adapter.client.data.get(leaf.routeId)
  },
)

export const queryCacheServer = defineTool<typeof QueryCacheInput, ToolCtx>(queryCacheDef).server(
  async (_input, ctx) => {
    const queryCache = ctx.adapter.queryCache
    if (!queryCache) return {queries: [], mutations: []}
    const [queries, mutations] = await Promise.all([queryCache.queries(), queryCache.mutations()])
    return {queries, mutations}
  },
)

export const navigateServer = defineTool<typeof NavigateInput, ToolCtx>(navigateDef).server(async (input, ctx) => {
  await ctx.adapter.client.navigation.navigate({to: input.to, replace: input.replace})
  return {ok: true, to: input.to}
})

export const routerInvalidateServer = defineTool<typeof RouterInvalidateInput, ToolCtx>(routerInvalidateDef).server(
  async (_input, ctx) => {
    await ctx.adapter.client.navigation.refresh()
    return {ok: true}
  },
)

export const backServer = defineTool<typeof BackInput, ToolCtx>(backDef).server(async (_input, ctx) => {
  await ctx.adapter.client.navigation.back()
  return {ok: true}
})

export const queryInvalidateServer = defineTool<typeof QueryInvalidateInput, ToolCtx>(queryInvalidateDef).server(
  async (input, ctx) => {
    await ctx.adapter.queryCache?.invalidate(input.key)
    return {ok: true}
  },
)

export const queryRefetchServer = defineTool<typeof QueryRefetchInput, ToolCtx>(queryRefetchDef).server(
  async (input, ctx) => {
    await ctx.adapter.queryCache?.refetch(input.key)
    return {ok: true}
  },
)

export const buildErrorsServer = defineTool<typeof BuildErrorsInput, ToolCtx>(buildErrorsDef).server((_input, ctx) =>
  ctx.adapter.server.errors.snapshot(),
)

export const routeManifestServer = defineTool<typeof RouteManifestInput, ToolCtx>(routeManifestDef).server(
  (_input, ctx) => ctx.adapter.server.manifest.routes(),
)

export const serverFnTraceServer = defineTool<typeof ServerFnTraceInput, ToolCtx>(serverFnTraceDef).server(
  async (input, ctx) => {
    if (!ctx.adapter.serverFunctions) return {traces: [], functions: []}
    const [traces, functions] = await Promise.all([
      ctx.adapter.serverFunctions.traces(input.count ?? Number.MAX_SAFE_INTEGER),
      ctx.adapter.serverFunctions.list(),
    ])
    return {traces, functions}
  },
)
