import type {AnchorResolver} from './resolver.js'

const cache = new Map<string, Promise<AnchorResolver>>()

export function loadResolver(root: string): Promise<AnchorResolver> {
  const existing = cache.get(root)
  if (existing) return existing
  const created = import('./resolver.js').then((m) => m.createReactAnchorResolver({root}))
  cache.set(root, created)
  return created
}
