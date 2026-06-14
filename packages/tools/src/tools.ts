import type {AidxToolContext} from './types.js'
import {aidxUiTool} from './ui.js'

export type {AidxToolContext} from './types.js'

// The aidx tool list: @tanstack/ai server tools bound to a runtime context, in one place so the
// MCP server (and tests) get them with a single import. page + test tools are added in their tasks.
export function aidxTools(ctx: AidxToolContext) {
  return [aidxUiTool(ctx)]
}
