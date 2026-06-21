import {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import {PageQueryInputSchema, PageQueryKindSchema} from '@mandarax/protocol/page-types'
import type {MandaraxToolContext} from './types.js'

// since/timeout are plain numbers (not the shared schema's z.coerce.number(), which is for the HTTP
// query-string route): over MCP/JSON the model sends real numbers, keeping inferred arg types precise.
export const PageInput = PageQueryInputSchema.extend({
  verb: PageQueryKindSchema,
  since: z.number().optional(),
  timeout: z.number().optional(),
  hookId: z.number().optional(),
})

export function createPageToolDefinition(ctx: MandaraxToolContext): ToolDefinition<typeof PageInput> {
  return defineTool({
    name: 'mandarax_page',
    label: 'Page',
    description:
      'Read and drive the live page DOM and React tree by ref/selector/name. Reads: snapshot, query, text, value, dom. Actions: click, fill (text/number/select/textarea), select, check, uncheck, hover, press, scroll, submit. React: tree, inspect, find, locate, override, track. One snapshot returns a ref for every control — act on all of them before re-snapshotting.',
    parameters: PageInput,
    execute: ({verb, ...input}) => ctx.page({kind: verb, ...input}),
  })
}
