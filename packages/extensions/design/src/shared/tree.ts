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
