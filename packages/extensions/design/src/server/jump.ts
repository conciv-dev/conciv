import type {Design, DesignNode, GateRow, LiveComponent, Mapping} from '../shared/defs.js'
import {readIds} from '../shared/id-tree.js'
import {walk} from '../shared/tree.js'
import {idTreeOf} from './id-tree.js'

export function jumpRows(input: {
  root: DesignNode
  reads: ReturnType<typeof readIds>
  wider: {design: Design; mapping: Mapping; width: number}
  live: LiveComponent
  sheets: string
  own: number
  width: number
}): GateRow[] {
  const {root, reads, wider, live, own, width} = input
  const midpoint = Math.round((own + wider.width) / 2)
  if (width <= midpoint) return []
  const at = idTreeOf({live, sheets: input.sheets, mapping: wider.mapping, previous: null})
  const widely = readIds({root: at.root, live})
  const narrowNodes = new Map([...walk(root)].map(({node}) => [node.id, node]))
  return [...walk(wider.design.root)].flatMap(({node: wide}): GateRow[] => {
    const [element] = widely.of(wide.id)
    const node = element === undefined ? undefined : narrowNodes.get(reads.nodeOf(element) ?? '')
    if (node === undefined || element === undefined || !keptNarrow({node, wide, element})) return []
    return [jumpRow({node, wide, reads, own, width, wider: wider.width, midpoint})]
  })
}

function jumpRow(input: {
  node: DesignNode
  wide: DesignNode
  reads: ReturnType<typeof readIds>
  own: number
  width: number
  wider: number
  midpoint: number
}): GateRow {
  const {node, wide, reads, own, width, midpoint} = input
  const kind = node.gate?.kind ?? node.kind
  const name = node.figma?.name ?? ''
  return {
    node: node.id,
    ...reads.named(node.id),
    kind,
    name,
    text: `${kind} ${name} [${node.id}] at ${width} wide: lays its children out in a ${node.layout?.direction} as the ${own} px frame does, though ${width} is nearer the ${input.wider} px frame, which lays them out in a ${wide.layout?.direction}; switch to the ${own} px layout below ${midpoint}`,
    magnitude: 'reflow',
    width,
  }
}

function keptNarrow(input: {node: DesignNode; wide: DesignNode; element: LiveComponent}): boolean {
  const {node, wide, element} = input
  const way = node.layout?.direction
  const wideWay = wide.layout?.direction
  if (way === undefined || wideWay === undefined || way === wideWay) return false
  const placed = element.children.filter((child) => child.bounds.w > 0 && child.bounds.h > 0)
  return placed.length > 1 && placed.every((child) => child.axis === way)
}
