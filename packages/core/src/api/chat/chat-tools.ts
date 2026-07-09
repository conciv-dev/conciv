import {toolDefinition, type AnyTool, type StreamChunk} from '@tanstack/ai'
import type {z} from 'zod'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import {aguiToolDurationFor} from '@conciv/protocol/tool-timing'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'

type Registrable = {name: string; description: string; inputSchema: z.ZodObject<z.ZodRawShape>}

type ToolRun = (args: unknown, context?: {toolCallId?: string}) => Promise<unknown>

export function toChatTool(tool: Registrable, run: ToolRun): AnyTool {
  return toolDefinition({name: tool.name, description: tool.description, inputSchema: tool.inputSchema}).server(run)
}

export function buildChatTools(
  makeCtx: (sessionId: string) => ConcivToolContext,
  extensionTools: ExtensionServerTool[],
  sessionModel: (sessionId: string) => string | null,
  injectChunk: (sessionId: string, chunk: StreamChunk) => boolean,
): (sessionId: string) => AnyTool[] {
  return (sessionId) => {
    const ctx = makeCtx(sessionId)
    const request: ToolRequest = {sessionId, model: sessionModel(sessionId)}
    const timed =
      (run: (args: unknown) => Promise<unknown>): ToolRun =>
      async (args, context) => {
        const started = performance.now()
        try {
          return await run(args)
        } finally {
          const toolCallId = context?.toolCallId
          if (toolCallId) {
            injectChunk(sessionId, aguiToolDurationFor(toolCallId, Math.round(performance.now() - started)))
          }
        }
      }
    return [
      ...concivTools(ctx).map((tool) =>
        toChatTool(
          tool,
          timed((args) => tool.execute(args)),
        ),
      ),
      ...extensionTools.map((tool) =>
        toChatTool(
          tool,
          timed((args) => tool.execute(args, request)),
        ),
      ),
    ]
  }
}
