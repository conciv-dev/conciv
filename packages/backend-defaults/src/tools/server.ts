import {aiErrors} from '@conciv/errors'
import {UiInputSchema} from '@conciv/types/ui-types'
import type {ConcivServerTool, ConcivToolContext} from './types.js'
import {concivUiToolDef} from './ui.js'
import {LOGS_QUERY, SET_LOG_LEVEL, logsQueryTool, setLogLevelTool} from './log-level.js'

function concivUiServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const tool = concivUiToolDef.server(() => ctx.askUi())
  const run = tool.execute
  if (!run) throw aiErrors.UI_TOOL_UNAVAILABLE()
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: UiInputSchema,
    execute: async (input) => run(UiInputSchema.parse(input)),
  }
}

export function concivSandboxTools(ctx: ConcivToolContext): ConcivServerTool[] {
  return [concivUiServerTool(ctx), setLogLevelTool(ctx), logsQueryTool(ctx)]
}

export function concivSandboxToolNames(): string[] {
  return [concivUiToolDef.name, SET_LOG_LEVEL, LOGS_QUERY]
}
