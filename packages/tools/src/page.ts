import {z} from 'zod'
import {PAGE_TOOL_PREFIX, pageVerbOfTool} from '@conciv/extension-page/defs'
import type {PageCapability} from './types.js'

const PAGE_TOOL_PREAMBLE =
  'Read and drive the live page and its React tree. Pick one capability with `verb`, and target an element by `ref` (from a snapshot), `selector`, or React component `name`. Every capability the running app offers is listed below; each capability validates its own arguments.'

export function pageCapabilities(entries: readonly PageCapability[]): PageCapability[] {
  return entries.filter((entry) => entry.name.startsWith(PAGE_TOOL_PREFIX))
}

function capabilityLine(entry: PageCapability): string {
  const hint = entry.hint ? ` - ${entry.hint}` : ''
  return `- ${pageVerbOfTool(entry.name)}: ${entry.summary}${hint}`
}

function groupOrder(entries: readonly PageCapability[]): string[] {
  return [...new Set(entries.map((entry) => entry.category ?? 'other'))]
}

export function pageToolDescription(entries: readonly PageCapability[]): string {
  const sections = groupOrder(entries).map((group) =>
    [`${group}:`, ...entries.filter((entry) => (entry.category ?? 'other') === group).map(capabilityLine)].join('\n'),
  )
  return [PAGE_TOOL_PREAMBLE, ...sections].join('\n\n')
}

export function pageInputFor(entries: readonly PageCapability[]) {
  const verbs = entries.map((entry) => pageVerbOfTool(entry.name))
  if (verbs.length === 0) throw new Error('conciv_page: the registry declares no page capabilities')
  return z.looseObject({
    verb: z.enum(verbs).describe('the capability to run'),
    selector: z.string().optional().describe('CSS selector for the target element'),
    ref: z.string().optional().describe('element ref from the latest snapshot'),
    name: z.string().optional().describe('React component name (targets the first match)'),
  })
}

export const PAGE_TOOL_NAME = 'conciv_page'
