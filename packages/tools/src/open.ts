import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'

// Open a source file in the user's editor — the natural follow-up to locate/inspect (which return
// file:line). Exposed as an MCP tool so the chat agent opens files directly instead of shelling out
// to `aidx tools open` (which the chat permission gate blocks).
export const OpenInput = z.object({file: z.string().min(1), line: z.number().optional()})

export const aidxOpenToolDef = toolDefinition({
  name: 'aidx_open',
  description: "Open a source file (optionally at a line) in the user's editor — e.g. after locate/inspect.",
  inputSchema: OpenInput,
})
