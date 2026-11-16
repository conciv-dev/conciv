import {Operations, PAGE_NAMESPACE} from '@conciv/plugin-page/rpc'

export const PAGE_TOOL_PREFIX = `${PAGE_NAMESPACE}_`

export const PAGE_ACT_TOOL_NAMES: ReadonlySet<string> = new Set(
  Operations.filter((operation) => operation.mutating).map((operation) => `${PAGE_TOOL_PREFIX}${operation.name}`),
)

export function pageVerbOfTool(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}
