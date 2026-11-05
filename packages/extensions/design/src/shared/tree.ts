export function* walk<T extends {children: T[]}>(
  root: T,
): Generator<{node: T; parent: T | null; index: number; depth: number}> {
  yield* visit({node: root, parent: null, index: 0, depth: 0})
}

function* visit<T extends {children: T[]}>(step: {
  node: T
  parent: T | null
  index: number
  depth: number
}): Generator<{node: T; parent: T | null; index: number; depth: number}> {
  yield step
  for (const [index, child] of step.node.children.entries()) {
    yield* visit({node: child, parent: step.node, index, depth: step.depth + 1})
  }
}
