import {defineTool} from '@conciv/extension'
import type {PageCaller} from '@conciv/extension'
import type {tanstackVerbs} from '../client/verbs.js'
import {LoaderDataInput, RouteTreeInput, RouterStateInput, loaderDataDef, routeTreeDef, routerStateDef} from './def.js'

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
