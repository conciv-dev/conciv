import {join} from 'node:path'
import launchEditor from 'launch-editor'
import {start, type Engine} from '@devgent/core/engine'
import type {DevgentConfig} from '@devgent/protocol/config-types'
import {installDevgentBinShim} from './bin-shim.js'

// Bridge-less engine booter for the non-vite bundlers (no Vite-style live server → no
// /api/server/*). Memoized so repeated hooks boot @devgent/core once. The vite hook boots with
// its own viteBridge + widget middleware.

function openInEditor(file: string, line: number): void {
  launchEditor(`${file}:${line}`)
}

export function makeEngineBooter(options: DevgentConfig, root: string): () => Promise<Engine> {
  let booting: Promise<Engine> | null = null
  return () => {
    if (booting) return booting
    const lockDir = options.lockDir ?? root
    const agentPath = installDevgentBinShim(join(lockDir, '.devgent'))
    booting = start({
      options,
      root,
      launchEditor: openInEditor,
      childEnv: (corePort) => ({...process.env, PATH: agentPath, DEVGENT_PORT: String(corePort)}),
    })
    return booting
  }
}
