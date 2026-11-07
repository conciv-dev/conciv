import type {IdNode, Mapping} from '../shared/defs.js'

export function attached(input: {node: IdNode; mapping: Mapping}): IdNode {
  const {node, mapping} = input
  return {
    ...node,
    fom: mapping[node.id]?.nodes ?? [],
    children: node.children.map((child) => attached({node: child, mapping})),
  }
}
