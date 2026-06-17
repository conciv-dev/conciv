import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import type {AidxMcpTool, AidxToolContext} from './types.js'

// Open a source file in the user's editor — the natural follow-up to locate/inspect (which return
// file:line). Exposed as an MCP tool so the chat agent opens files directly instead of shelling out
// to `aidx tools open` (which the chat permission gate blocks).
export const OpenInput = z.object({file: z.string().min(1), line: z.number().optional()})

export const aidxOpenToolDef = toolDefinition({
  name: 'aidx_open',
  description: "Open a source file (optionally at a line) in the user's editor — e.g. after locate/inspect.",
  inputSchema: OpenInput,
})

export function aidxOpenTool(ctx: AidxToolContext): AidxMcpTool {
  const server = aidxOpenToolDef.server(async ({file, line}) => {
    ctx.open(file, line)
    return {ok: true, file, ...(line === undefined ? {} : {line})}
  })
  const execute = server.execute
  return {
    name: server.name,
    description: server.description,
    inputSchema: OpenInput,
    run: async (args) => (execute ? execute(OpenInput.parse(args)) : undefined),
  }
}
