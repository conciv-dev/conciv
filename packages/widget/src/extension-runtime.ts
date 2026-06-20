import type {MandaraxExtension} from '@mandarax/extensions'
import './mandarax-global.js'

// Install use() on the shared __MANDARAX__ namespace (merging, never clobbering react-grab's keys),
// drain anything pre-seeded in queue, and apply each future use() live.
export function installExtensionGlobal(applyClient: (ext: MandaraxExtension) => void): void {
  const pending = window.__MANDARAX__?.queue ?? []
  window.__MANDARAX__ = {...window.__MANDARAX__, use: applyClient}
  for (const ext of pending) applyClient(ext)
}
