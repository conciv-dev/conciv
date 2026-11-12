import {start, type Engine, type PortRequest} from '@conciv/core/start'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {installConcivBinShim} from './bin-shim.js'
import {makeOpenInEditor} from './open-editor.js'
import {type Builtins, loadExtensionPackages, loadServerExtensions} from '@conciv/extension-compiler/extensions'

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
    const agentPath = installConcivBinShim(concivStateDir(stateRoot))

    booting = loadExtensionPackages(options.extensions).then(async (installed) =>
      start({
        options,
        root,
        port: options.port === undefined ? undefined : toPortRequest(portPolicy, options.port),
        launchEditor: makeOpenInEditor(root),
        extensions: await loadServerExtensions(root, installed.extensions),
        extensionConfig: installed.config,
        nativePageDir: builtins.nativePageDir,
        devEndpointDir: options.devEndpointDir,
        homeDir: options.homeDir,
        childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
      }),
    )
    return booting
  }
}
