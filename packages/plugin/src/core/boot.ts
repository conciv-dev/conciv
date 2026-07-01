import {join} from 'node:path'
import {start, type Engine} from '@conciv/core/engine'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {installConcivBinShim} from './bin-shim.js'
import {makeOpenInEditor} from './open-editor.js'
import {type Builtins, loadServerExtensions} from './extensions.js'

// Bridge-less engine booter for the non-vite bundlers (no Vite-style live server → no
// /api/server/*). Memoized so repeated hooks boot @conciv/core once. The vite hook boots with
// its own viteBridge + widget middleware.

export function makeEngineBooter(options: ConcivConfig, root: string, builtins: Builtins): () => Promise<Engine> {
  let booting: Promise<Engine> | null = null
  return () => {
    if (booting) return booting
    const stateRoot = options.stateRoot ?? root
    const agentPath = installConcivBinShim(join(stateRoot, '.conciv'))
    // jiti-load extension server halves so .server tools + prompt work under any bundler, not just vite.
    booting = loadServerExtensions(root, builtins.serverExtensions).then((extensions) =>
      start({
        options,
        root,
        port: options.port,
        launchEditor: makeOpenInEditor(root),
        extensions,
        childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
      }),
    )
    return booting
  }
}
