import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer, type ViteDevServer} from 'vite'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {NO_BUILTINS, type Builtins} from '@conciv/extension-compiler/extensions'
import {makeViteHook} from '../../src/core/vite.js'

const PORT_RELEASE_MS = 300

export type StartedDevServer = {server: ViteDevServer; root: string}

export type DevServers = {
  start: (options?: Omit<ConcivConfig, 'stateRoot'>, builtins?: Builtins) => Promise<StartedDevServer>
  tempDir: (prefix: string) => string
  stopAll: () => Promise<void>
}

export function devServers(): DevServers {
  const running: ViteDevServer[] = []
  const dirs: string[] = []

  const tempDir = (prefix: string): string => {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }

  const start = async (options: Omit<ConcivConfig, 'stateRoot'> = {}, builtins = NO_BUILTINS) => {
    const root = tempDir('conciv-vite-root-')
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
      plugins: [makeViteHook({enabled: true, stateRoot: root, ...options}, builtins)],
    })
    running.push(server)
    await server.listen()
    return {server, root}
  }

  const stopAll = async (): Promise<void> => {
    for (const server of running.splice(0)) await server.close()
    await new Promise((resolve) => setTimeout(resolve, PORT_RELEASE_MS))
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  }

  return {start, tempDir, stopAll}
}

export async function pageApiBase(server: ViteDevServer, url = '/'): Promise<string> {
  const html = await server.transformIndexHtml(url, '<!doctype html><html><head></head><body></body></html>')
  const apiBase = html.match(/name="pw-api-base"[^>]*content="([^"]+)"/)?.[1]
  if (!apiBase) throw new Error(`no api base injected, got ${html}`)
  return apiBase
}
