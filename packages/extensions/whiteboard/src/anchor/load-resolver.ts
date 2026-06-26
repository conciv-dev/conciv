import type {AnchorResolver} from './resolver.js'

// resolver.js pulls in oxc-parser (a native node binding) — it must never enter the client static
// graph. Server tools load it lazily through here at execute time; the import() makes it a separate
// chunk vite leaves external. Memoized per root.
const cache = new Map<string, Promise<AnchorResolver>>()

export function loadResolver(root: string): Promise<AnchorResolver> {
  const existing = cache.get(root)
  if (existing) return existing
  const created = import('./resolver.js').then((m) => m.createReactAnchorResolver({root}))
  cache.set(root, created)
  return created
}
