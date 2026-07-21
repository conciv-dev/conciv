import {defineTool} from '@conciv/extension'
import {z} from 'zod'
import type {PageCaller} from '@conciv/extension'
import type {tanstackVerbs} from '../client/verbs.js'

type ToolCtx = {page: PageCaller<typeof tanstackVerbs>}

const inputSchema = z.object({})

export const routerState = defineTool<typeof inputSchema, ToolCtx>({
  name: 'tanstack_router_state',
  description:
    "Read the running app's current TanStack Router state: matched routes, params, search, loader status. Use it to see what the user is looking at before acting.",
  inputSchema,
}).server(async (_input, ctx) => ctx.page.call('routerState', {}))
