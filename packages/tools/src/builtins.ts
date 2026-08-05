import type {PageQueryKind} from '@conciv/protocol/page-types'
import type {ToolMeta} from '@conciv/extension/tool'
import {BUILTIN_PAGE_TOOLS, type BuiltinPageTool} from './builtins/page-tools.js'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from './builtins/server-tools.js'

export {BUILTIN_PAGE_TOOLS, type BuiltinPageTool} from './builtins/page-tools.js'
export {
  BUILTIN_OPEN_TOOL,
  BUILTIN_SERVER_TOOL,
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

const PAGE_TOOL_META: Partial<Record<PageQueryKind, ToolMeta>> = Object.fromEntries(
  BUILTIN_PAGE_TOOLS.map((tool) => [pageVerbOfTool(tool.name), requireMeta(tool)]),
)

const KINDS_WITHOUT_A_TOOL: readonly PageQueryKind[] = ['ext']

function pageToolMeta(kind: PageQueryKind): ToolMeta | undefined {
  const meta = PAGE_TOOL_META[kind]
  if (meta === undefined && !KINDS_WITHOUT_A_TOOL.includes(kind)) {
    throw new Error(`no built-in page tool declares "${kind}"`)
  }
  return meta
}

export function pageVerbMutates(kind: PageQueryKind): boolean {
  return pageToolMeta(kind)?.mutating === true
}

export function pageVerbMirrors(kind: PageQueryKind): boolean {
  return pageToolMeta(kind)?.mirrors === true
}

export function builtinToolNames(): string[] {
  return [...BUILTIN_PAGE_TOOLS, ...BUILTIN_SERVER_TOOLS, BUILTIN_OPEN_TOOL].map((tool) => tool.name)
}
