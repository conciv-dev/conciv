import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {createServer, type ViteDevServer} from 'vite'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'
import {unplugin} from '../src/plugin-instance.js'
import type {ConcivConfig} from '../src/plugin/vite.js'

const ENDPOINT_FILE = 'dev-endpoint.json'

const state: {server: ViteDevServer | undefined; others: ViteDevServer[]; dirs: string[]; home: string | undefined} = {
  server: undefined,
  others: [],
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
  await Promise.all(state.others.splice(0).map((server) => server.close()))
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

function engineFiles(root: string): string[] {
  return ['server.json', 'mcp-endpoint.json'].map((file) => readFileSync(join(concivStateDir(root), file), 'utf8'))
}

describe('a second dev server on a project whose engine is live', () => {
  it('leaves the live engine its server and mcp endpoint files when its port is taken', async () => {
    const root = tempDir('conciv-it-root-')
    const homeDir = tempDir('conciv-it-home-')
    const plugin: ConcivConfig = {stateRoot: root, harnessBin: 'true', systemPrompt: false, widget: false, homeDir}
    const first = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
      plugins: [unplugin.vite({...plugin, devEndpointDir: tempDir('conciv-it-endpoint-')})],
    })
    state.server = first
    await first.listen()
    await expect.poll(() => existsSync(join(concivStateDir(root), 'mcp-endpoint.json'))).toBe(true)
    const before = engineFiles(root)
    const {port} = z.object({port: z.number()}).parse(first.httpServer?.address())
    const second = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port, strictPort: true},
      plugins: [unplugin.vite({...plugin, devEndpointDir: tempDir('conciv-it-endpoint-')})],
    })
    state.others.push(second)

    await expect(second.listen()).rejects.toThrow()

    expect(engineFiles(root)).toEqual(before)
  }, 60_000)

  it('leaves the live engine its server and mcp endpoint files when it listens on another port', async () => {
    const root = tempDir('conciv-it-root-')
    const homeDir = tempDir('conciv-it-home-')
    const plugin: ConcivConfig = {stateRoot: root, harnessBin: 'true', systemPrompt: false, widget: false, homeDir}
    const boot = async (): Promise<ViteDevServer> => {
      const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        server: {host: '127.0.0.1', port: 0},
        plugins: [unplugin.vite({...plugin, devEndpointDir: tempDir('conciv-it-endpoint-')})],
      })
      state.others.push(server)
      await server.listen()
      return server
    }
    await boot()
    await expect.poll(() => existsSync(join(concivStateDir(root), 'mcp-endpoint.json'))).toBe(true)
    const before = engineFiles(root)

    const warned = vi.spyOn(console, 'warn')
    await boot()
    await expect.poll(() => warned.mock.calls.flat().join('\n')).toContain('already serves')
    warned.mockRestore()

    expect(engineFiles(root)).toEqual(before)
  }, 60_000)
})
