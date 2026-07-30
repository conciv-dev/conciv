import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {createServer, type ViteDevServer} from 'vite'
import {unplugin} from '../src/plugin-instance.js'

const ENDPOINT_FILE = 'dev-endpoint.json'

const state: {server: ViteDevServer | undefined; dirs: string[]; home: string | undefined} = {
  server: undefined,
  dirs: [],
  home: undefined,
}

async function bootDevServer(root: string, devEndpointDir: string | undefined): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
    plugins: [unplugin.vite({stateRoot: root, harnessBin: 'true', systemPrompt: false, widget: false, devEndpointDir})],
  })
  state.server = server
  await server.listen()
  return server
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  state.dirs.push(dir)
  return dir
}

afterEach(async () => {
  await state.server?.close()
  state.server = undefined
  if (state.home !== undefined) process.env.HOME = state.home
  state.home = undefined
  await new Promise((resolve) => setTimeout(resolve, 300))
  for (const dir of state.dirs) rmSync(dir, {recursive: true, force: true})
  state.dirs = []
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
