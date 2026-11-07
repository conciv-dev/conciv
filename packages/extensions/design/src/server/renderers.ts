import type {LiveComponent, Mapping} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function renderersOf(input: {live: LiveComponent; mapping: Mapping; matches: Map<string, string[]>}): Renderers {
  const elements = new Map(
    [...walk(input.live)].flatMap(({node, depth}) => (depth === 0 ? [] : [[node.path, node] as const])),
  )
  const selectors = new Map(input.mapping.map((entry) => [entry.figma.nodeId, entry.selector]))
  const paths = (node: string): string[] => {
    const selector = selectors.get(node)
    return selector === undefined ? [] : (input.matches.get(selector) ?? [])
  }
  const nodesAt = new Map<string, string>()
  input.mapping.forEach((entry) =>
    paths(entry.figma.nodeId).forEach((path) => {
      if (!nodesAt.has(path)) nodesAt.set(path, entry.figma.nodeId)
    }),
  )
  return {
    of: (node) => paths(node).flatMap((path) => elements.get(path) ?? []),
    nodeOf: (element) => nodesAt.get(element.path) ?? null,
    mapped: (node) => selectors.has(node),
    selector: (node) => selectors.get(node) ?? null,
  }
}

type Renderers = {
  of: (node: string) => LiveComponent[]
  nodeOf: (element: LiveComponent) => string | null
  mapped: (node: string) => boolean
  selector: (node: string) => string | null
}
