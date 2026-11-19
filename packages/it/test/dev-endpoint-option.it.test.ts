import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {createServer, type ViteDevServer} from 'vite'
import {unplugin} from '../src/plugin-instance.js'

const ENDPOINT_FILE = 'dev-endpoint.json'

const state: {server: ViteDevServer | undefined; home: string | undefined} = {
  server: undefined,
  home: undefined,
}

async function bootDevServer(root: string, devEndpointDir: string | undefined): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
    plugins: [unplugin.vite({stateRoot: root, systemPrompt: false, widget: false, devEndpointDir})],
  })
  state.server = server
  await server.listen()
  return server
}

afterEach(async () => {
  await state.server?.close()
  state.server = undefined
  if (state.home !== undefined) process.env.HOME = state.home
  state.home = undefined
  await new Promise((resolve) => setTimeout(resolve, 300))
})

describe('a CommonJS bundler config', () => {
  it.each(['webpack', 'rspack'])('requires @conciv/it/plugin/%s and builds the plugin with .default()', (bundler) => {
    const required: {default: () => {apply: unknown}} = createRequire(import.meta.url)(`@conciv/it/plugin/${bundler}`)
    expect(typeof required.default().apply).toBe('function')
  })
})

describe('the dev endpoint dir the conciv plugin boots a core with', () => {
  it('writes the pairing file where the devEndpointDir option points', async () => {
    const root = tempDir('conciv-it-root-')
    const endpointDir = tempDir('conciv-it-endpoint-')

    await bootDevServer(root, endpointDir)

    expect(existsSync(join(endpointDir, ENDPOINT_FILE))).toBe(true)
  }, 60_000)

  it('writes the pairing file into the home directory when a host leaves the option unset', async () => {
    const root = tempDir('conciv-it-root-')
    const home = tempDir('conciv-it-home-')
    state.home = process.env.HOME
    process.env.HOME = home

    await bootDevServer(root, undefined)

    expect(existsSync(join(home, '.conciv', ENDPOINT_FILE))).toBe(true)
  }, 60_000)
})
