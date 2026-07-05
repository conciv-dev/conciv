import {z} from 'zod'

export const TERMINAL_NAME = 'terminal'

export const TerminalOpenRequestSchema = z.object({
  cols: z.number().int().min(2).max(500).optional(),
  rows: z.number().int().min(2).max(500).optional(),
  model: z.string().min(1).max(200).optional(),
})

const TerminalStateSchema = z.object({alive: z.boolean(), busy: z.boolean()})
export type TerminalState = z.infer<typeof TerminalStateSchema>
