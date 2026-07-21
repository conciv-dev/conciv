import {defineTool} from '@conciv/extension'
import type {PageCaller} from '@conciv/extension'
import type {tanstackVerbs} from '../client/verbs.js'
import {
  BackInput,
  LoaderDataInput,
  NavigateInput,
  QueryCacheInput,
  QueryInvalidateInput,
  QueryRefetchInput,
  RouteTreeInput,
  RouterInvalidateInput,
  RouterStateInput,
  backDef,
  loaderDataDef,
  navigateDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  routeTreeDef,
  routerInvalidateDef,
  routerStateDef,
} from './def.js'

type ToolCtx = {page: PageCaller<typeof tanstackVerbs>}

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
