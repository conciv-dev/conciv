import type {AidxMcpTool, AidxToolContext} from './types.js'
import {aidxPageTool} from './page.js'
import {aidxTestTool} from './test.js'
import {aidxUiTool} from './ui.js'
import {aidxOpenTool} from './open.js'

export type {AidxMcpTool, AidxToolContext} from './types.js'

// The aidx tool list as uniform MCP descriptors, bound to a runtime context, in one place so the
// MCP server (and tests) get them with a single import.
export function aidxTools(ctx: AidxToolContext): AidxMcpTool[] {
  return [aidxUiTool(ctx), aidxPageTool(ctx), aidxTestTool(ctx), aidxOpenTool(ctx)]
}
