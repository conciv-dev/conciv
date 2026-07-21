import {rm} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import solid from 'vite-plugin-solid'
import {buildConcivHost} from './build-host.js'
import {serveDir} from './serve.js'
import type {HostEngine, HostHandle} from './get-extension-test-api.js'

const hostDir = fileURLToPath(new URL('./host', import.meta.url))

export function fixtureHost(clientEntry: string): (engine: HostEngine) => Promise<HostHandle> {
  return async (engine) => {
    const outDir = await buildConcivHost({root: hostDir, plugins: [solid()], clientEntry})
    const served = await serveDir(outDir, {apiBase: engine.apiBase, session: engine.session})
    return {
      origin: served.origin,
      close: async () => {
        await served.close()
        await rm(outDir, {recursive: true, force: true}).catch(() => {})
      },
    }
  }
}
