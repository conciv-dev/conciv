import {join} from 'node:path'
import launchEditor from 'launch-editor'
import {start, type Engine} from '@opendui/aidx-core/engine'
import type {AidxConfig} from '@opendui/aidx-protocol/config-types'
import {installAidxBinShim} from './bin-shim.js'

// Bridge-less engine booter for the non-vite bundlers (no Vite-style live server → no
// /api/server/*). Memoized so repeated hooks boot @opendui/aidx-core once. The vite hook boots with
// its own viteBridge + widget middleware.

function openInEditor(file: string, line: number): void {
  launchEditor(`${file}:${line}`)
}

export function makeEngineBooter(options: AidxConfig, root: string): () => Promise<Engine> {
  let booting: Promise<Engine> | null = null
  return () => {
    if (booting) return booting
    const stateRoot = options.stateRoot ?? root
    const agentPath = installAidxBinShim(join(stateRoot, '.aidx'))
    booting = start({
      options,
      root,
      port: options.port,
      launchEditor: openInEditor,
      childEnv: (corePort) => ({...process.env, PATH: agentPath, AIDX_PORT: String(corePort)}),
    })
    return booting
  }
}
