import {join} from 'node:path'
import {start, type Engine} from '@mandarax/core/engine'
import type {MandaraxConfig} from '@mandarax/protocol/config-types'
import {installMandaraxBinShim} from './bin-shim.js'
import {makeOpenInEditor} from './open-editor.js'
import {bootServices} from './services.js'

// Bridge-less engine booter for the non-vite bundlers (no Vite-style live server → no
// /api/server/*). Memoized so repeated hooks boot @mandarax/core once. The vite hook boots with
// its own viteBridge + widget middleware.

export function makeEngineBooter(options: MandaraxConfig, root: string): () => Promise<Engine> {
  let booting: Promise<Engine> | null = null
  return () => {
    if (booting) return booting
    const stateRoot = options.stateRoot ?? root
    const agentPath = installMandaraxBinShim(join(stateRoot, '.mandarax'))
    // jiti-load extension server halves so .server tools + prompt work under any bundler, not just vite.
    booting = bootServices(root, stateRoot).then(async (services) => {
      const engine = await start({
        options,
        root,
        port: options.port,
        launchEditor: makeOpenInEditor(root),
        extensions: services.extensions,
        dbProxyTarget: services.dbProxyTarget,
        syncHooks: services.syncHooks,
        childEnv: (corePort) => ({...process.env, PATH: agentPath, MANDARAX_PORT: String(corePort)}),
      })
      return {...engine, stop: async () => void (await engine.stop(), await services.stop())}
    })
    return booting
  }
}
