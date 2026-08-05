const POINTER_PREFIX = '#/'

function decodePointerToken(token: string): string {
  return decodeURIComponent(token).replaceAll('~1', '/').replaceAll('~0', '~')
}

function pointerTarget(reference: string, root: Record<string, unknown>): unknown {
  if (reference === '#') return root
  if (!reference.startsWith(POINTER_PREFIX)) return undefined
  const tokens = reference.slice(POINTER_PREFIX.length).split('/').map(decodePointerToken)
  return tokens.reduce<unknown>((node, token) => {
    if (node === null || typeof node !== 'object') return undefined
    return Reflect.get(node, token)
  }, root)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SKIPPED_KEYS = new Set(['$defs', 'definitions', '$schema', '$id'])

function resolveNode(node: unknown, root: Record<string, unknown>, ancestors: readonly unknown[]): unknown {
  if (Array.isArray(node)) return node.map((entry) => resolveNode(entry, root, ancestors))
  if (!isRecord(node)) return node
  const reference = node.$ref
  if (typeof reference === 'string') {
    const target = pointerTarget(reference, root)
    if (target === undefined || ancestors.includes(target)) return {}
    return resolveNode(target, root, [...ancestors, target])
  }
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue
    resolved[key] = resolveNode(value, root, ancestors)
  }
  return resolved
}

export function resolveSchemaRefs(schema: unknown): unknown {
  if (!isRecord(schema)) return schema
  return resolveNode(schema, schema, [schema])
}
