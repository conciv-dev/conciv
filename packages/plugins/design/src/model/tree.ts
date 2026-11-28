type Visit<T> = {node: T; parent: T | null; index: number; depth: number}

export function* walk<T extends {children: T[]}>(root: T): Generator<Visit<T>> {
  yield* visit({node: root, parent: null, index: 0, depth: 0})
}

function* visit<T extends {children: T[]}>(step: Visit<T>): Generator<Visit<T>> {
  yield step
  for (const [index, child] of step.node.children.entries()) {
    yield* visit({node: child, parent: step.node, index, depth: step.depth + 1})
  }
}
