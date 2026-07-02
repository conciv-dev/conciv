import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import {PageQueryInputSchema, PageQueryKindSchema} from '@conciv/protocol/page-types'

export const PageInput = PageQueryInputSchema.extend({
  verb: PageQueryKindSchema,
  since: z.number().optional(),
  timeout: z.number().optional(),
  hookId: z.number().optional(),
})

export const concivPageToolDef = toolDefinition({
  name: 'conciv_page',
  description:
    'Read and drive the live page DOM and React tree by ref/selector/name. Reads: snapshot, query, text, value, dom. Actions: click, fill (text/number/select/textarea), select, check, uncheck, hover, press, scroll, submit. React: tree, inspect, find, locate, override, track. One snapshot returns a ref for every control — act on all of them before re-snapshotting.',
  inputSchema: PageInput,
})
