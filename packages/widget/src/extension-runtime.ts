import {createSignal, type Accessor} from 'solid-js'
import type {ExtensionBuilder} from '@mandarax/extension'
import './mandarax-global.js'

// Collect the live extensions: seed with the built-ins, drain anything pre-queued on the shared
// __MANDARAX__ namespace, and accept future use() calls. Upsert by name so an HMR re-apply replaces
// rather than duplicates. The widget reads the returned accessor to render extension slots.
export function installExtensionGlobal(seed: ExtensionBuilder<object>[]): Accessor<ExtensionBuilder<object>[]> {
  const [extensions, setExtensions] = createSignal<ExtensionBuilder<object>[]>(seed)
  const add = (extension: ExtensionBuilder<object>): void => {
    setExtensions((prev) => [...prev.filter((existing) => existing.name !== extension.name), extension])
  }
  for (const queued of window.__MANDARAX__?.queue ?? []) add(queued)
  window.__MANDARAX__ = {...window.__MANDARAX__, use: add}
  return extensions
}
