import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll} from 'vitest'
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import recorderServer from '../../src/server.js'

const hostDist = fileURLToPath(new URL('../../dist/test-host', import.meta.url))

export function useRecorderTestApi(opts: {harness?: HarnessAdapter} = {}): () => ExtensionTestApi {
  const ctx: {api?: ExtensionTestApi} = {}
  beforeAll(async () => {
    ctx.api = await getExtensionTestApi({server: recorderServer, host: fixtureHost(hostDist), harness: opts.harness})
  }, 120_000)
  afterAll(async () => ctx.api?.dispose())
  return () => {
    if (!ctx.api) throw new Error('testkit not booted')
    return ctx.api
  }
}
