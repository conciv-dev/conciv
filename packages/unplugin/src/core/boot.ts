import {start, type Engine, type PortRequest} from '@conciv/core/start'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {installConcivBinShim} from './bin-shim.js'
import {makeOpenInEditor} from './open-editor.js'

export type Builtins = {
  embedEntry?: string
  dedupeEntry?: string
  nativePageDir?: string
}

export type PortPolicy = 'exact' | 'preferred'

function toPortRequest(policy: PortPolicy, port: number): PortRequest {
  return policy === 'exact' ? {exact: port} : {preferred: port}
}

export function makeEngineBooter(
  options: ConcivConfig,
  root: string,
  builtins: Builtins,
  portPolicy: PortPolicy,
): () => Promise<Engine> {
  let booting: Promise<Engine> | null = null
  return () => {
    if (booting) return booting
    const stateRoot = options.stateRoot ?? root
    booting = Promise.try(() => installConcivBinShim(concivStateDir(stateRoot))).then((agentPath) =>
      start({
        options,
        root,
        port: options.port === undefined ? undefined : toPortRequest(portPolicy, options.port),
        launchEditor: makeOpenInEditor(root),
        nativePageDir: builtins.nativePageDir,
        devEndpointDir: options.devEndpointDir,
        homeDir: options.homeDir,
        childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
      }),
    )
    return booting
  }
}
