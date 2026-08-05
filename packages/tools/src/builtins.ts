import type {ToolMeta} from '@conciv/extension'
import {BUILTIN_PAGE_TOOLS, type BuiltinPageTool} from './builtins/page-tools.js'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from './builtins/server-tools.js'

export {BUILTIN_PAGE_TOOLS, type BuiltinPageTool} from './builtins/page-tools.js'
export {
  BUILTIN_OPEN_TOOL,
  BUILTIN_SERVER_TOOLS,
  type OpenToolContext,
  type ServerToolContext,
} from './builtins/server-tools.js'
export type {BuiltinCategory} from './builtins/shared.js'

export const PAGE_TOOL_PREFIX = 'page.'

export const SERVER_TOOL_PREFIX = 'server.'

function withoutPrefix(name: string, prefix: string, family: string): string {
  if (!name.startsWith(prefix)) throw new Error(`"${name}" is not a ${family} tool`)
  return name.slice(prefix.length)
}

export function pageVerbOfTool(name: string): string {
  return withoutPrefix(name, PAGE_TOOL_PREFIX, 'page')
}

export function serverOperationOfTool(name: string): string {
  return withoutPrefix(name, SERVER_TOOL_PREFIX, 'dev-server')
}

function requireMeta(tool: BuiltinPageTool): ToolMeta {
  const meta = tool.meta
  if (meta === undefined) throw new Error(`tool "${tool.name}" declares no meta`)
  return meta
}

const PAGE_TOOL_META: Record<string, ToolMeta> = Object.fromEntries(
  BUILTIN_PAGE_TOOLS.map((tool) => [pageVerbOfTool(tool.name), requireMeta(tool)]),
)

export function pageVerbMutates(verb: string): boolean {
  return PAGE_TOOL_META[verb]?.mutating === true
}

export function pageVerbMirrors(verb: string): boolean {
  return PAGE_TOOL_META[verb]?.mirrors === true
}

export function builtinToolNames(): string[] {
  return [...BUILTIN_PAGE_TOOLS, ...BUILTIN_SERVER_TOOLS, BUILTIN_OPEN_TOOL].map((tool) => tool.name)
}
