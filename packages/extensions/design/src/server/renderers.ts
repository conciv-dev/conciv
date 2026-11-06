import type {LiveComponent, Mapping} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function renderersOf(input: {live: LiveComponent; mapping: Mapping}): Renderers {
  const elements = [...walk(input.live)].flatMap(({node, depth}) => (depth === 0 ? [] : [node]))
  const declared = groupedBy({elements, of: (element) => (element.figma === null ? [] : [element.figma])})
  const keys = new Map<string, string[]>()
  input.mapping.forEach((entry) =>
    keys.set(entry.figma.nodeId, [...(keys.get(entry.figma.nodeId) ?? []), entry.conciv]),
  )
  const nodesOfKey = new Map<string, string[]>()
  input.mapping.forEach((entry) =>
    nodesOfKey.set(entry.conciv, [...(nodesOfKey.get(entry.conciv) ?? []), entry.figma.nodeId]),
  )
  const keyed = groupedBy({elements, of: (element) => (element.key === null ? [] : [element.key])})
  const of = (node: string): LiveComponent[] => {
    const own = declared.get(node)
    if (own !== undefined) return own
    return (keys.get(node) ?? []).flatMap((key) => keyed.get(key) ?? [])
  }
  const nodeOf = (element: LiveComponent): string | null => {
    if (element.figma !== null && declared.has(element.figma)) return element.figma
    return element.key === null ? null : (nodesOfKey.get(element.key)?.[0] ?? null)
  }
  return {of, nodeOf, mapped: (node) => keys.has(node), declared: [...declared.keys()]}
}

type Renderers = {
  of: (node: string) => LiveComponent[]
  nodeOf: (element: LiveComponent) => string | null
  mapped: (node: string) => boolean
  declared: string[]
}

function groupedBy(input: {
  elements: LiveComponent[]
  of: (element: LiveComponent) => string[]
}): Map<string, LiveComponent[]> {
  const groups = new Map<string, LiveComponent[]>()
  input.elements.forEach((element) =>
    input.of(element).forEach((name) => groups.set(name, [...(groups.get(name) ?? []), element])),
  )
  return groups
}
