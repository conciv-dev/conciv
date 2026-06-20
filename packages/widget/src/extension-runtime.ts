import type {MandaraxExtension} from '@mandarax/extensions'
import './mandarax-global.js'

// Install use() on the shared __MANDARAX__ namespace (merging, never clobbering react-grab's keys),
// drain anything pre-seeded in queue, and apply each future use() live. Each extension is isolated:
// a throwing client hook is reported and skipped, so one bad extension can't abort the queue drain or
// the widget's own initialization (initPageBus runs regardless).
export function installExtensionGlobal(applyClient: (ext: MandaraxExtension) => void): void {
  const safeApply = (ext: MandaraxExtension): void => {
    try {
      applyClient(ext)
    } catch (err) {
      console.error(`[mandarax] extension "${ext?.id ?? '?'}" failed to apply:`, err)
    }
  }
  const pending = window.__MANDARAX__?.queue ?? []
  window.__MANDARAX__ = {...window.__MANDARAX__, use: safeApply}
  for (const ext of pending) safeApply(ext)
}
