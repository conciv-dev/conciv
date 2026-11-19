import {cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {findPackageJSON} from 'node:module'
import {dirname, join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {onTestFinished} from 'vitest'
import {createLogger, createServer, type ViteDevServer} from 'vite'
import {magicLink, recordedEngineBase} from '@conciv/harness-testkit/login'
import type {ConcivConfig, ExtensionPackage} from '@conciv/protocol/config-types'
import type {Builtins} from '../../src/core/boot.js'
import {makeViteHook} from '../../src/core/vite.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const FIXTURE_EXTENSION_DIR = join(import.meta.dirname, '..', 'fixtures', 'extension')
const FIXTURE_PLUGIN_DIR = join(import.meta.dirname, '..', 'fixtures', 'plugin')

export type StartedDevServer = {server: ViteDevServer; root: string}

export type DevServers = {
  start: (options?: Omit<ConcivConfig, 'stateRoot'>, builtins?: Builtins, root?: string) => Promise<StartedDevServer>
  tempDir: (prefix: string) => string
  stopAll: () => Promise<void>
}

function createDevServer(options: Omit<ConcivConfig, 'stateRoot'>, builtins: Builtins, root: string) {
  return createServer({
    root,
    configFile: false,
    customLogger: createLogger('silent'),
    server: {host: '127.0.0.1', port: 0},
    plugins: [makeViteHook({enabled: true, stateRoot: root, ...options}, builtins)],
  })
}

export function devServers(): DevServers {
  const running: ViteDevServer[] = []
  const dirs: string[] = []

  const trackedTempDir = (prefix: string): string => {
    const dir = tempDir(prefix)
    dirs.push(dir)
    return dir
  }

  const start = async (
    options: Omit<ConcivConfig, 'stateRoot'> = {},
    builtins: Builtins = {},
    root = tempDir('conciv-vite-root-'),
  ) => {
    const server = await createDevServer(options, builtins, root)
    running.push(server)
    await server.listen()
    return {server, root}
  }

  const stopAll = async (): Promise<void> => {
    for (const server of running.splice(0)) await server.close()
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  }

  return {start, tempDir: trackedTempDir, stopAll}
}

export function testTempDir(prefix: string): string {
  const dir = realpathSync(tempDir(prefix))
  onTestFinished(() => rm(dir, {recursive: true, force: true, maxRetries: 10}))
  return dir
}

export function closeWhenTestFinishes(server: ViteDevServer): ViteDevServer {
  onTestFinished(() => server.close())
  return server
}

export async function startTestDevServer(
  options: Omit<ConcivConfig, 'stateRoot'> = {},
  builtins: Builtins = {},
  root = testTempDir('conciv-vite-root-'),
): Promise<StartedDevServer> {
  const server = closeWhenTestFinishes(await createDevServer(options, builtins, root))
  await server.listen()
  return {server, root}
}

export function fixtureExtension(dir = FIXTURE_EXTENSION_DIR): ExtensionPackage {
  return {server: join(dir, 'server.mjs'), client: join(dir, 'client.mjs'), config: undefined}
}

export type PluginEntries = NonNullable<ConcivConfig['plugins']>

export function fixturePlugin(disposedMarker: string): PluginEntries {
  return [[FIXTURE_PLUGIN_DIR, {disposedMarker}]]
}

export function fixturePluginEntries(): PluginEntries {
  return [FIXTURE_PLUGIN_DIR]
}

export function installFixturePlugin(root: string): void {
  cpSync(FIXTURE_PLUGIN_DIR, join(root, 'conciv', 'plugins', 'fixture'), {recursive: true})
}

export async function magicLinkUrl(started: StartedDevServer, url: string): Promise<string> {
  return magicLink(recordedEngineBase(started.root), url)
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

export function installConcivPackage(root: string, name: string, nodeModules = join(root, 'node_modules')): string {
  const sourceDir = packageDirFrom(name, dirname(import.meta.dirname))
  if (sourceDir === null) throw new Error(`${name} is not resolvable from @conciv/unplugin`)
  installPackage(nodeModules, name, sourceDir, new Set())
  return join(nodeModules, name)
}
