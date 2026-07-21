import {defineTool} from '@conciv/extension'
import {z} from 'zod'
import type {PageCaller} from '@conciv/extension'
import type {tanstackVerbs} from '../client/verbs.js'

type ToolCtx = {page: PageCaller<typeof tanstackVerbs>}

const inputSchema = z.object({})

export const routeTree = defineTool<typeof inputSchema, ToolCtx>({
  name: 'tanstack_route_tree',
  description:
    "Read the running app's TanStack Router route tree: the nested route definitions, their paths, kinds, and which routes declare a loader. Use it to understand the app's routing structure.",
  inputSchema,
}).server(async (_input, ctx) => ctx.page.call('routeTree', {}))
