import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from './builtins/server-tools.js'

export {
  BUILTIN_OPEN_TOOL,
  BUILTIN_SERVER_TOOL,
  BUILTIN_SERVER_TOOLS,
  type OpenToolContext,
  type ServerToolContext,
} from './builtins/server-tools.js'
export type {BuiltinCategory} from './builtins/shared.js'

export const SERVER_TOOL_PREFIX = 'server_'

export function serverOperationOfTool(name: string): string {
  if (!name.startsWith(SERVER_TOOL_PREFIX)) throw new Error(`"${name}" is not a dev-server tool`)
  return name.slice(SERVER_TOOL_PREFIX.length)
}

export function builtinToolNames(): string[] {
  return [...BUILTIN_SERVER_TOOLS, BUILTIN_OPEN_TOOL].map((tool) => tool.name)
}
