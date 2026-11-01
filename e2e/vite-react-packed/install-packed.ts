import {execFileSync} from 'node:child_process'
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {PACKED_APP_DIR, PACKED_ROOT} from './packed-app-dir.ts'

type Tarball = {name: string; filename: string}

const HERE = import.meta.dirname
const TARBALL_DIR = join(PACKED_ROOT, 'tarballs')

function isTarball(value: unknown): value is Tarball {
  if (typeof value !== 'object' || value === null) return false
  return 'name' in value && typeof value.name === 'string' && 'filename' in value && typeof value.filename === 'string'
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).every((entry) => typeof entry === 'string')
}

function parseJson(text: string): unknown {
  return JSON.parse(text)
}

function readJson(path: string): unknown {
  return parseJson(readFileSync(path, 'utf8'))
}

function timed<T>(label: string, step: () => T): T {
  const started = performance.now()
  const result = step()
  console.log(`[vite-react-packed] ${label}: ${((performance.now() - started) / 1000).toFixed(1)}s`)
  return result
}

function packConcivChain(): Tarball[] {
  const output = parseJson(
    execFileSync('pnpm', ['--filter-prod', '@conciv/it...', 'pack', '--pack-destination', TARBALL_DIR, '--json'], {
      cwd: HERE,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  )
  if (!Array.isArray(output) || !output.every(isTarball)) throw new Error('pnpm pack --json returned no tarball list')
  return output
}

function consumerDependencies(): Record<string, string> {
  const manifest = readJson(join(HERE, 'package.json'))
  const dependencies =
    typeof manifest === 'object' && manifest !== null && 'dependencies' in manifest ? manifest.dependencies : undefined
  if (!isStringRecord(dependencies)) throw new Error('package.json has no dependencies to install')
  return Object.fromEntries(Object.keys(dependencies).map((name) => [name, installedVersion(name)]))
}

function installedVersion(name: string): string {
  const manifest = readJson(join(HERE, 'node_modules', name, 'package.json'))
  const version = typeof manifest === 'object' && manifest !== null && 'version' in manifest ? manifest.version : null
  if (typeof version !== 'string') throw new Error(`no installed version for ${name}`)
  return version
}

function workspaceConfig(key: string): unknown {
  return parseJson(execFileSync('pnpm', ['config', 'get', key, '--json'], {cwd: HERE, encoding: 'utf8'}))
}

function writeConsumer(tarballs: Tarball[]): void {
  cpSync(join(HERE, 'app'), PACKED_APP_DIR, {recursive: true})
  const manifest = {name: 'vite-react-packed', private: true, type: 'module', dependencies: consumerDependencies()}
  writeFileSync(join(PACKED_APP_DIR, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const workspace = {
    overrides: Object.fromEntries(tarballs.map((tarball) => [tarball.name, `file:${tarball.filename}`])),
    allowBuilds: {'isolated-vm': true},
    minimumReleaseAge: workspaceConfig('minimumReleaseAge'),
  }
  writeFileSync(join(PACKED_APP_DIR, 'pnpm-workspace.yaml'), `${JSON.stringify(workspace, null, 2)}\n`)
}

function install(): void {
  const args = ['install', '--no-frozen-lockfile']
  const [command, commandArgs] = process.env.GITHUB_ACTIONS === 'true' ? ['sfw', ['pnpm', ...args]] : ['pnpm', args]
  execFileSync(command, commandArgs, {cwd: PACKED_APP_DIR, stdio: 'inherit'})
}

rmSync(PACKED_ROOT, {recursive: true, force: true})
mkdirSync(TARBALL_DIR, {recursive: true})
const tarballs = timed('pack', packConcivChain)
writeConsumer(tarballs)
timed('install', install)
