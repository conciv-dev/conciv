import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {CliTools, Operations, PAGE_NAMESPACE, type Method, type Operation} from '@conciv/plugin-page/rpc'

type NamedOperation<Name extends Method> = Extract<Operation, {readonly name: Name}>

export const PAGE_TOOL_PREFIX = `${PAGE_NAMESPACE}_`

export const PAGE_ACT_TOOL_NAMES: ReadonlySet<string> = new Set(
  Operations.filter((operation) => operation.mutating).map((operation) => `${PAGE_TOOL_PREFIX}${operation.name}`),
)

export function pageToolMeta(name: string): ToolViewMeta | undefined {
  const operation = Operations.find((candidate) => `${PAGE_TOOL_PREFIX}${candidate.name}` === name)
  if (!operation) return undefined
  const view = CliTools[operation.name]?.view
  return {summary: operation.description, mutating: operation.mutating, icon: view?.icon, label: view?.label}
}

export function pageOperation<const Name extends Method>(name: Name): NamedOperation<Name> {
  const operation = Operations.find((candidate): candidate is NamedOperation<Name> => candidate.name === name)
  if (operation === undefined) throw new Error(`No page operation is named ${name}`)
  return operation
}

export function pageVerbOfTool(name: string): string {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) throw new Error(`"${name}" is not a page tool`)
  return name.slice(PAGE_TOOL_PREFIX.length)
}

export function pageVerbGerund(verb: string): string {
  const word = pageToolMeta(`${PAGE_TOOL_PREFIX}${verb}`)?.label?.running.split(' ')[0] ?? ''
  return word.length > 0 ? word : verb
}
