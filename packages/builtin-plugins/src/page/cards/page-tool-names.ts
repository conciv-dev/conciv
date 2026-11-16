import {Operations, PAGE_NAMESPACE, RunningLabels} from '@conciv/plugin-page/rpc'

export const PAGE_TOOL_PREFIX = `${PAGE_NAMESPACE}_`

export const PAGE_ACT_TOOL_NAMES: ReadonlySet<string> = new Set(
  Operations.filter((operation) => operation.mutating).map((operation) => `${PAGE_TOOL_PREFIX}${operation.name}`),
)

export const PAGE_RUNNING_TITLES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RunningLabels).map(([method, label]) => [`${PAGE_TOOL_PREFIX}${method}`, label]),
)

export function pageVerbOfTool(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}

export function pageVerbGerund(verb: string): string {
  const word = PAGE_RUNNING_TITLES[`${PAGE_TOOL_PREFIX}${verb}`]?.split(' ')[0] ?? ''
  return word.length > 0 ? word : verb
}
