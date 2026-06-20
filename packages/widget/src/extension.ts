import type {ThemeTokens} from '@mandarax/ui-kit-system'
import type {ComposerActionDef} from './widget-shell.js'

export type ClientApi = {
  ui: {setTheme: (tokens: ThemeTokens) => void}
  registerComposerAction: (def: ComposerActionDef) => void
}

export type MandaraxExtension = {
  id: string
  clientFn?: (mx: ClientApi) => void
  serverFn?: (mx: unknown) => void
}

export type ExtensionBuilder = MandaraxExtension & {
  client: (fn: (mx: ClientApi) => void) => ExtensionBuilder
  server: (fn: (mx: unknown) => void) => ExtensionBuilder
}

export function defineExtension(meta: {id: string}): ExtensionBuilder {
  const builder: ExtensionBuilder = {
    id: meta.id,
    client(fn) {
      builder.clientFn = fn
      return builder
    },
    server(fn) {
      builder.serverFn = fn
      return builder
    },
  }
  return builder
}

// Install use() on the shared __MANDARAX__ namespace (merging, never clobbering react-grab's keys),
// drain anything pre-seeded in queue, and apply each future use() live.
export function installExtensionGlobal(applyClient: (ext: MandaraxExtension) => void): void {
  const pending = window.__MANDARAX__?.queue ?? []
  window.__MANDARAX__ = {...window.__MANDARAX__, use: applyClient}
  for (const ext of pending) applyClient(ext)
}
