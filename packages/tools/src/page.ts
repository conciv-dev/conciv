import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import {PageQueryInputSchema, PageQueryKindSchema} from '@opendui/aidx-protocol/page-types'
import type {AidxMcpTool, AidxToolContext} from './types.js'

// verb + the page-query input fields, as a single ZodObject (the MCP server registers it directly).
// since/timeout are plain numbers here (not the shared schema's z.coerce.number(), which exists for
// the HTTP query-string route): over MCP/JSON the model sends real numbers, and plain numbers keep
// the inferred handler-arg types precise (z.coerce's input type is `unknown`).
export const PageInput = PageQueryInputSchema.extend({
  verb: PageQueryKindSchema,
  since: z.number().optional(),
  timeout: z.number().optional(),
  hookId: z.number().optional(),
})

export const aidxPageToolDef = toolDefinition({
  name: 'aidx_page',
  description: 'Inspect and drive the live page DOM/React tree: tree, inspect, find, locate, click, type, etc.',
  inputSchema: PageInput,
})

export function aidxPageTool(ctx: AidxToolContext): AidxMcpTool {
  const server = aidxPageToolDef.server(async ({verb, ...input}) => ctx.page({kind: verb, ...input}))
  const execute = server.execute
  return {
    name: server.name,
    description: server.description,
    inputSchema: PageInput,
    run: async (args) => (execute ? execute(PageInput.parse(args)) : undefined),
  }
}
