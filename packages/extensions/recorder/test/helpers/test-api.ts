import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll} from 'vitest'
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import recorderServer from '../../src/server.js'

const clientEntry = fileURLToPath(new URL('../../src/client.tsx', import.meta.url))

export function useRecorderTestApi(): () => ExtensionTestApi {
  const ctx: {api?: ExtensionTestApi} = {}
  beforeAll(async () => {
    ctx.api = await getExtensionTestApi({server: recorderServer, host: fixtureHost(clientEntry)})
  }, 120_000)
  afterAll(async () => ctx.api?.dispose())
  return () => {
    if (!ctx.api) throw new Error('testkit not booted')
    return ctx.api
  }
}
