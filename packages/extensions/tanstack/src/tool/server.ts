import {defineTool} from '@conciv/extension'
import type {PageCaller} from '@conciv/extension'
import type {AppError, ServerFnInfo, ServerFnTrace, ServerRouteInfo} from '@conciv/protocol/framework-types'
import type {tanstackVerbs} from '../client/verbs.js'
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

type ToolCtx = {page: PageCaller<typeof tanstackVerbs>}

type ServerReadCtx = {
  buildErrors: () => AppError[]
  routeManifest: () => Promise<ServerRouteInfo[]>
}

type ServerFnTraceCtx = {
  serverFnTraces: (count?: number) => ServerFnTrace[]
  serverFns: () => ServerFnInfo[]
}

export const routerStateServer = defineTool<typeof RouterStateInput, ToolCtx>(routerStateDef).server(
  async (_input, ctx) => ctx.page.call('routerState', {}),
)

export const routeTreeServer = defineTool<typeof RouteTreeInput, ToolCtx>(routeTreeDef).server(async (_input, ctx) =>
  ctx.page.call('routeTree', {}),
)

export const loaderDataServer = defineTool<typeof LoaderDataInput, ToolCtx>(loaderDataDef).server(async (input, ctx) =>
  ctx.page.call('loaderData', {routeId: input.routeId}),
)

export const queryCacheServer = defineTool<typeof QueryCacheInput, ToolCtx>(queryCacheDef).server(async (_input, ctx) =>
  ctx.page.call('queryCache', {}),
)

export const navigateServer = defineTool<typeof NavigateInput, ToolCtx>(navigateDef).server(async (input, ctx) =>
  ctx.page.call('navigate', {to: input.to, replace: input.replace}),
)

export const routerInvalidateServer = defineTool<typeof RouterInvalidateInput, ToolCtx>(routerInvalidateDef).server(
  async (_input, ctx) => ctx.page.call('routerInvalidate', {}),
)

export const backServer = defineTool<typeof BackInput, ToolCtx>(backDef).server(async (_input, ctx) =>
  ctx.page.call('back', {}),
)

export const queryInvalidateServer = defineTool<typeof QueryInvalidateInput, ToolCtx>(queryInvalidateDef).server(
  async (input, ctx) => ctx.page.call('queryInvalidate', {key: input.key}),
)

export const queryRefetchServer = defineTool<typeof QueryRefetchInput, ToolCtx>(queryRefetchDef).server(
  async (input, ctx) => ctx.page.call('queryRefetch', {key: input.key}),
)

export const buildErrorsServer = defineTool<typeof BuildErrorsInput, ServerReadCtx>(buildErrorsDef).server(
  async (_input, ctx) => ctx.buildErrors(),
)

export const routeManifestServer = defineTool<typeof RouteManifestInput, ServerReadCtx>(routeManifestDef).server(
  async (_input, ctx) => ctx.routeManifest(),
)

export const serverFnTraceServer = defineTool<typeof ServerFnTraceInput, ServerFnTraceCtx>(serverFnTraceDef).server(
  async (input, ctx) => ({traces: ctx.serverFnTraces(input.count), functions: ctx.serverFns()}),
)
