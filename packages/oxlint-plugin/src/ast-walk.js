export function isNode(value) {
  return typeof value === 'object' && value !== null && typeof value.type === 'string'
}

export function isIdentifier(value) {
  return isNode(value) && value.type === 'Identifier'
}

function walkList(items, visit) {
  for (const item of items) walk(item, visit)
}

function walkChildren(node, visit) {
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue
    walk(child, visit)
  }
}

export function walk(value, visit) {
  if (Array.isArray(value)) return walkList(value, visit)
  if (!isNode(value)) return
  if (visit(value) === 'skip') return
  walkChildren(value, visit)
}
