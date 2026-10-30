import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync} from 'node:fs'
import {findPackageJSON} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServer, type ViteDevServer} from 'vite'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {NO_BUILTINS, type Builtins} from '@conciv/extension-compiler/extensions'
import {makeViteHook} from '../../src/core/vite.js'

const PORT_RELEASE_MS = 300

export type StartedDevServer = {server: ViteDevServer; root: string}

export type DevServers = {
  start: (options?: Omit<ConcivConfig, 'stateRoot'>, builtins?: Builtins, root?: string) => Promise<StartedDevServer>
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

  const start = async (
    options: Omit<ConcivConfig, 'stateRoot'> = {},
    builtins = NO_BUILTINS,
    root = tempDir('conciv-vite-root-'),
  ) => {
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
  const apiBase = html.match(/name="conciv-api-base"[^>]*content="([^"]+)"/)?.[1]
  if (!apiBase) throw new Error(`no api base injected, got ${html}`)
  return apiBase
}

function dependencyNames(manifest: unknown, field: string): string[] {
  if (typeof manifest !== 'object' || manifest === null) return []
  const value: unknown = Reflect.get(manifest, field)
  return typeof value === 'object' && value !== null ? Object.keys(value) : []
}

function publishedFiles(manifest: unknown): string[] {
  if (typeof manifest !== 'object' || manifest === null) return ['dist']
  const files: unknown = Reflect.get(manifest, 'files')
  return Array.isArray(files) ? files.filter((entry) => typeof entry === 'string') : ['dist']
}

function packageDirFrom(name: string, fromDir: string): string | null {
  try {
    const manifest = findPackageJSON(name, pathToFileURL(join(fromDir, 'package.json')))
    return manifest === undefined ? null : realpathSync(dirname(manifest))
  } catch {
    return null
  }
}

function installPackage(nodeModules: string, name: string, sourceDir: string, installed: Set<string>): void {
  if (installed.has(name)) return
  installed.add(name)
  const manifest: unknown = JSON.parse(readFileSync(join(sourceDir, 'package.json'), 'utf8'))
  const target = join(nodeModules, name)
  mkdirSync(target, {recursive: true})
  cpSync(join(sourceDir, 'package.json'), join(target, 'package.json'))
  for (const entry of publishedFiles(manifest)) {
    cpSync(join(sourceDir, entry), join(target, entry), {
      recursive: true,
      filter: (path) => !path.includes('.global.js'),
    })
  }
  for (const dependency of [
    ...dependencyNames(manifest, 'dependencies'),
    ...dependencyNames(manifest, 'peerDependencies'),
  ]) {
    const dependencyDir = packageDirFrom(dependency, sourceDir)
    if (dependencyDir === null) continue
    if (dependency.startsWith('@conciv/')) {
      installPackage(nodeModules, dependency, dependencyDir, installed)
      continue
    }
    const link = join(nodeModules, dependency)
    if (existsSync(link)) continue
    mkdirSync(dirname(link), {recursive: true})
    symlinkSync(dependencyDir, link)
  }
}

export function installConcivPackage(root: string, name: string): string {
  const sourceDir = packageDirFrom(name, dirname(import.meta.dirname))
  if (sourceDir === null) throw new Error(`${name} is not resolvable from @conciv/plugin`)
  installPackage(join(root, 'node_modules'), name, sourceDir, new Set())
  return join(root, 'node_modules', name)
}
