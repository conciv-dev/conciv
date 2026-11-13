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
    const wideWay = wide.layout?.direction
    const [element] = widely.of(wide.id)
    if (wideWay === undefined || element === undefined) return []
    const id = reads.nodeOf(element)
    const node = id === null ? undefined : narrowNodes.get(id)
    const way = node?.layout?.direction
    const placed = element.children.filter((child) => child.bounds.w > 0 && child.bounds.h > 0)
    if (node === undefined || way === undefined || way === wideWay || placed.length < 2 || element.axis !== way)
      return []
    const kind = node.gate?.kind ?? node.kind
    const name = node.figma?.name ?? ''
    return [
      {
        node: node.id,
        ...reads.named(node.id),
        kind,
        name,
        text: `${kind} ${name} [${node.id}] at ${width} wide: lays its children out in a ${way} as the ${own} px frame does, though ${width} is nearer the ${wider.width} px frame, which lays them out in a ${wideWay}; switch to the ${own} px layout below ${midpoint}`,
        magnitude: 'reflow',
        width,
      },
    ]
  })
}
