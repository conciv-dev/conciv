import {UiInputSchema} from '@conciv/types/ui-types'
import type {ConcivServerTool, ConcivToolContext} from './types.js'
import {concivUiToolDef} from './ui.js'
import {SET_LOG_LEVEL, setLogLevelTool} from './log-level.js'

function concivUiServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const tool = concivUiToolDef.server(() => ctx.askUi())
  const run = tool.execute
  if (!run) throw new Error('conciv_ui: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: UiInputSchema,
    execute: async (input) => run(UiInputSchema.parse(input)),
  }
}

export function concivSandboxTools(ctx: ConcivToolContext): ConcivServerTool[] {
  return [concivUiServerTool(ctx), setLogLevelTool(ctx)]
}

export function concivSandboxToolNames(): string[] {
  return [concivUiToolDef.name, SET_LOG_LEVEL]
}
