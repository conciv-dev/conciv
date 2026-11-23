import type {Engine, LogEntry} from '@conciv/core/start'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {installConcivBinShim} from './bin-shim.js'
import {readEngineLine} from './engine-log.js'
import {makeOpenInEditor} from './open-editor.js'

export type Builtins = {
  embedEntry?: string
  nativePageDir?: string
}

function writeEngineLine(entry: LogEntry): void {
  const line = readEngineLine(entry)
  if (line === undefined) return
  const stream = entry.level === 'info' ? process.stdout : process.stderr
  stream.write(`${line}\n`)
}

export function makeEngineBooter(options: ConcivConfig, root: string, builtins: Builtins): () => Promise<Engine> {
  let booting: Promise<Engine> | null = null
  return () => {
    if (booting) return booting
    const stateRoot = options.stateRoot ?? root
    booting = Promise.try(() => installConcivBinShim(concivStateDir(stateRoot))).then(async (agentPath) => {
      const {start} = await import('@conciv/core/start')
      return start({
        options,
        root,
        port: options.port === undefined ? undefined : {exact: options.port},
        launchEditor: makeOpenInEditor(root),
        nativePageDir: builtins.nativePageDir,
        homeDir: options.homeDir,
        log: {emit: writeEngineLine},
        childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
      })
    })
    return booting
  }
}
