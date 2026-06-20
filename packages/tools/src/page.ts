import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import {PageQueryInputSchema, PageQueryKindSchema} from '@mandarax/protocol/page-types'

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

export const mandaraxPageToolDef = toolDefinition({
  name: 'mandarax_page',
  description:
    'Read and drive the live page DOM and React tree by ref/selector/name. Reads: snapshot, query, text, value, dom. Actions: click, fill (text/number/select/textarea), select, check, uncheck, hover, press, scroll, submit. React: tree, inspect, find, locate, override, track. One snapshot returns a ref for every control — act on all of them before re-snapshotting.',
  inputSchema: PageInput,
})
