import {existsSync} from 'node:fs'
import {serveDir} from './serve.js'
import type {HostEngine, HostHandle} from './get-extension-test-api.js'

export function fixtureHost(hostDist: string): (engine: HostEngine) => Promise<HostHandle> {
  return async (engine) => {
    if (!existsSync(hostDist)) {
      throw new Error(`prebuilt test host missing at ${hostDist} — run this package's build first`)
    }
    const served = await serveDir(hostDist, {apiBase: engine.apiBase, session: engine.session})
    return {origin: served.origin, close: () => served.close()}
  }
}
