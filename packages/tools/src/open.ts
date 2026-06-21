import {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import type {MandaraxToolContext} from './types.js'

export const OpenInput = z.object({file: z.string().min(1), line: z.number().optional()})

export function createOpenToolDefinition(ctx: MandaraxToolContext): ToolDefinition<typeof OpenInput> {
  return defineTool({
    name: 'mandarax_open',
    label: 'Open',
    description: "Open a source file (optionally at a line) in the user's editor — e.g. after locate/inspect.",
    parameters: OpenInput,
    execute: ({file, line}) => {
      ctx.open(file, line)
      return {ok: true, file, ...(line === undefined ? {} : {line})}
    },
  })
}
