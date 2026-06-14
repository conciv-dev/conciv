import {join} from 'node:path'
import launchEditor from 'launch-editor'
import {start, type Engine} from '@aidx/core/engine'
import type {AidxConfig} from '@aidx/protocol/config-types'
import {installAidxBinShim} from './bin-shim.js'

// Bridge-less engine booter for the non-vite bundlers (no Vite-style live server → no
// /api/server/*). Memoized so repeated hooks boot @aidx/core once. The vite hook boots with
// its own viteBridge + widget middleware.

function openInEditor(file: string, line: number): void {
  launchEditor(`${file}:${line}`)
}

export function makeEngineBooter(options: AidxConfig, root: string): () => Promise<Engine> {
  let booting: Promise<Engine> | null = null
  return () => {
    if (booting) return booting
    const lockDir = options.lockDir ?? root
    const agentPath = installAidxBinShim(join(lockDir, '.aidx'))
    booting = start({
      options,
      root,
      launchEditor: openInEditor,
      childEnv: (corePort) => ({...process.env, PATH: agentPath, AIDX_PORT: String(corePort)}),
    })
    return booting
  }
}
