import type {ContainerLayout, DesignNode} from './defs.js'
import type {DesignTree} from './types.js'

export function designTree(root: DesignNode): DesignTree {
  const visits = [...walk({root})]
  const nodes = visits.flatMap(({node, depth}) => (depth === 0 ? [] : [node]))
  return {
    root,
    nodes,
    byId: new Map(nodes.map((node) => [node.id, node])),
    parents: new Map(visits.flatMap(({node, parent}) => (parent === null ? [] : [[node.id, parent] as const]))),
  }
}

export function childrenIn(input: {tree: DesignTree; id: string | undefined}): DesignNode[] {
  const {tree, id} = input
  const parent = id === undefined ? tree.root : tree.byId.get(id)
  return (parent?.children ?? []).toSorted((a, b) => (a.layout?.index ?? 0) - (b.layout?.index ?? 0))
}

export function descendantsIn(input: {tree: DesignTree; id: string}): DesignNode[] {
  return childrenIn(input).flatMap((node) => [node, ...descendantsIn({tree: input.tree, id: node.id})])
}

export function placement(input: {node: DesignNode; tree: DesignTree}): Seat | null {
  const {node, tree} = input
  const above = tree.parents.get(node.id)
  const parent = above === undefined || above === tree.root ? null : above
  const layout = (parent ?? tree.root).layout
  const direction = layout?.direction
  const index = node.layout?.index
  if (direction === undefined || index === undefined) return null
  const run = (layout?.runs ?? []).find((entry) => entry.children.includes(node.id)) ?? null
  if (run === null) return {direction, index, parent}
  return {direction: run.direction, index: run.children.indexOf(node.id) + 1, parent}
}

type Seat = {direction: ContainerLayout['direction']; index: number; parent: DesignNode | null}

type Branching<T> = {children: T[]}

export type Visit<T> = {node: T; parent: T | null; index: number; depth: number}

export function* walk<T extends Branching<T>>(input: {root: T}): Generator<Visit<T>> {
  yield* visit({node: input.root, parent: null, index: 0, depth: 0})
}

export function find<T extends Branching<T> & {id: string}>(input: {root: T; id: string}): T | null
export function find<T extends Branching<T>>(input: {root: T; id: string; idOf: (node: T) => string}): T | null
export function find<T extends Branching<T> & {id?: string}>(input: {
  root: T
  id: string
  idOf?: (node: T) => string
}): T | null {
  const idOf = input.idOf ?? ownId
  for (const {node} of walk(input)) {
    if (idOf(node) === input.id) return node
  }
  return null
}

function* visit<T extends Branching<T>>(step: Visit<T>): Generator<Visit<T>> {
  yield step
  for (const [index, child] of step.node.children.entries()) {
    yield* visit({node: child, parent: step.node, index, depth: step.depth + 1})
  }
}

function ownId(node: {id?: string}): string | undefined {
  return node.id
}
