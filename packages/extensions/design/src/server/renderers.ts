import type {GateRow, LiveComponent, Mapping} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function renderersOf(input: {live: LiveComponent; mapping: Mapping; matches: Map<string, string[]>}): Renderers {
  const elements = new Map(
    [...walk(input.live)].flatMap(({node, depth}) => (depth === 0 ? [] : [[node.path, node] as const])),
  )
  const entries = new Map(input.mapping.map((entry) => [entry.figma.nodeId, entry]))
  const paths = (node: string): string[] => {
    const entry = entries.get(node)
    return entry === undefined ? [] : (input.matches.get(entry.selector) ?? [])
  }
  const of = (node: string): LiveComponent[] => paths(node).flatMap((path) => elements.get(path) ?? [])
  const nodesAt = new Map<string, string>()
  input.mapping.forEach((entry) =>
    paths(entry.figma.nodeId).forEach((path) => {
      if (!nodesAt.has(path)) nodesAt.set(path, entry.figma.nodeId)
    }),
  )
  return {
    of,
    nodeOf: (element) => nodesAt.get(element.path) ?? null,
    mapped: (node) => entries.has(node),
    named: (node) => {
      const entry = entries.get(node)
      const source = of(node)[0]?.source ?? null
      return {
        selector: entry?.selector ?? null,
        source: source === null ? null : `${source.file}:${source.line}:${source.column}`,
        confidence: entry?.confidence ?? null,
        margin: entry?.margin ?? null,
      }
    },
  }
}

type Renderers = {
  of: (node: string) => LiveComponent[]
  nodeOf: (element: LiveComponent) => string | null
  mapped: (node: string) => boolean
  named: (node: string) => Pick<GateRow, 'selector' | 'source' | 'confidence' | 'margin'>
}
