import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'

export const OpenInput = z.object({file: z.string().min(1), line: z.number().optional()})

export const concivOpenToolDef = toolDefinition({
  name: 'conciv_open',
  description: "Open a source file (optionally at a line) in the user's editor — e.g. after locate/inspect.",
  inputSchema: OpenInput,
})
