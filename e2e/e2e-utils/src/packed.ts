import {execFile, execFileSync} from 'node:child_process'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

function findWorkspaceRoot(): string {
  let dir = process.cwd()
  for (let depth = 0; depth < 12; depth++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) && existsSync(join(dir, 'packages'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('workspace root (pnpm-workspace.yaml) not found above cwd')
}

export const WORKSPACE_ROOT = findWorkspaceRoot()

export type PackageInfo = {dir: string; version: string | undefined; deps: Record<string, string>}

type ParsedManifest = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function tarballName(name: string, version: string): string {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).every((entry) => typeof entry === 'string')
}

function parseManifest(raw: unknown, manifestPath: string): ParsedManifest {
  if (typeof raw !== 'object' || raw === null) throw new Error(`invalid manifest at ${manifestPath}`)
  const name = 'name' in raw ? raw.name : undefined
  if (name !== undefined && typeof name !== 'string') throw new Error(`invalid manifest name at ${manifestPath}`)
  const version = 'version' in raw ? raw.version : undefined
  if (version !== undefined && typeof version !== 'string')
    throw new Error(`invalid manifest version at ${manifestPath}`)
  const dependencies = 'dependencies' in raw ? raw.dependencies : undefined
  if (dependencies !== undefined && !isStringRecord(dependencies)) {
    throw new Error(`invalid manifest dependencies at ${manifestPath}`)
  }
  const peerDependencies = 'peerDependencies' in raw ? raw.peerDependencies : undefined
  if (peerDependencies !== undefined && !isStringRecord(peerDependencies)) {
    throw new Error(`invalid manifest peerDependencies at ${manifestPath}`)
  }
  return {name, version, dependencies, peerDependencies}
}

export function readManifest(manifestPath: string): ParsedManifest {
  return parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), manifestPath)
}

function workspaceMemberDirs(): string[] {
  const listed: unknown = JSON.parse(
    execFileSync('pnpm', ['list', '--recursive', '--depth', '-1', '--json'], {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  )
  if (!Array.isArray(listed)) throw new Error('pnpm list did not return a workspace array')
  return listed.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const path = Reflect.get(entry, 'path')
    return typeof path === 'string' && path !== WORKSPACE_ROOT ? [path] : []
  })
}

export function workspacePackages(): Map<string, PackageInfo> {
  const byName = new Map<string, PackageInfo>()
  for (const dir of workspaceMemberDirs()) {
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = readManifest(manifestPath)
    if (manifest.name === undefined) continue
    byName.set(manifest.name, {
      dir,
      version: manifest.version,
      deps: {...manifest.dependencies, ...manifest.peerDependencies},
    })
  }
  return byName
}

export function closureOf(packages: ReadonlyMap<string, PackageInfo>, roots: string[]): string[] {
  const seen = new Set<string>()
  const stack = [...roots]
  while (stack.length > 0) {
    const name = stack.pop()
    if (name === undefined || seen.has(name)) continue
    const info = packages.get(name)
    if (info === undefined) continue
    seen.add(name)
    for (const dep of Object.keys(info.deps)) if (packages.has(dep)) stack.push(dep)
  }
  return [...seen].toSorted()
}

export const NON_INTERACTIVE_ENV = {...process.env, CI: 'true'}

export async function run(command: string, args: string[], cwd: string): Promise<void> {
  try {
    await execFileAsync(command, args, {cwd, env: NON_INTERACTIVE_ENV, maxBuffer: 64 * 1024 * 1024})
  } catch (error) {
    const stdout = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stdout') ?? '') : ''
    const stderr = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stderr') ?? '') : ''
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${stdout}\n${stderr}`, {cause: error})
  }
}

export async function buildAndPack(
  tgzDir: string,
  roots: string[],
): Promise<{overrides: Record<string, string>; closure: string[]}> {
  const byName = workspacePackages()
  const closure = closureOf(byName, roots)
  await run('pnpm', ['turbo', 'run', 'build', ...closure.flatMap((name) => ['--filter', name])], WORKSPACE_ROOT)
  await Promise.all(
    closure.map((name) => {
      const info = byName.get(name)
      if (!info) throw new Error(`missing workspace package ${name}`)
      return run('pnpm', ['pack', '--pack-destination', tgzDir], info.dir)
    }),
  )
  const overrides: Record<string, string> = {}
  for (const name of closure) {
    const info = byName.get(name)
    if (!info) throw new Error(`missing workspace package ${name}`)
    if (info.version === undefined) throw new Error(`workspace package ${name} has no version to pack`)
    const file = join(tgzDir, tarballName(name, info.version))
    if (!existsSync(file)) throw new Error(`no tarball packed for ${name} at ${file}`)
    overrides[name] = `file:${file}`
  }
  return {overrides, closure}
}

function workspaceConfig(key: string): unknown {
  return JSON.parse(execFileSync('pnpm', ['config', 'get', key, '--json'], {cwd: WORKSPACE_ROOT, encoding: 'utf8'}))
}

function releaseAgeYaml(): string[] {
  const minimumReleaseAge = workspaceConfig('minimumReleaseAge')
  if (typeof minimumReleaseAge !== 'number') throw new Error('minimumReleaseAge not set in root pnpm-workspace.yaml')
  const exclude = workspaceConfig('minimumReleaseAgeExclude')
  const excluded = Array.isArray(exclude) ? exclude.filter((name) => typeof name === 'string') : []
  return [
    `minimumReleaseAge: ${minimumReleaseAge}`,
    'minimumReleaseAgeExclude:',
    ...excluded.map((name) => `  - '${name}'`),
  ]
}

export type PackedLock = {path: string; updateCommand: string}

export type PackedInstallOptions = {
  root: string
  packages: string[]
  allowBuilds: Record<string, boolean>
  overrides: Record<string, string>
  lock: PackedLock
  fresh: boolean
}

function installCommand(): [string, string[]] {
  const args = ['install', '--no-frozen-lockfile', '--config.confirmModulesPurge=false']
  if (process.env.GITHUB_ACTIONS === 'true') return ['sfw', ['pnpm', ...args]]
  return ['pnpm', args]
}

export async function installPacked(options: PackedInstallOptions): Promise<void> {
  const workspaceYaml = [
    'packages:',
    ...options.packages.map((pattern) => `  - '${pattern}'`),
    ...releaseAgeYaml(),
    'allowBuilds:',
    ...Object.entries(options.allowBuilds).map(([name, allowed]) => `  ${name}: ${allowed}`),
    'overrides:',
    ...Object.entries(options.overrides).map(([name, value]) => `  '${name}': '${value}'`),
    '',
  ].join('\n')
  writeFileSync(join(options.root, 'pnpm-workspace.yaml'), workspaceYaml)
  if (!options.fresh && existsSync(options.lock.path)) {
    writeFileSync(join(options.root, 'pnpm-lock.yaml'), readFileSync(options.lock.path, 'utf8'))
  }
  const [command, args] = installCommand()
  await run(command, args, options.root)
  assertClosed(options.root)
  if (!options.fresh) assertLockNotDrifted(options.root, options.lock)
}

const REGISTRY_PINNED = /(?<![\w/@-])@conciv\/[a-z0-9-]+@(?!file:)\d/

export function assertClosed(root: string): void {
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')
  const leaks: string[] = []
  for (const line of lock.split('\n')) {
    if (!line.includes('conciv')) continue
    if (REGISTRY_PINNED.test(line) || line.includes('registry.npmjs.org')) leaks.push(line.trim())
  }
  if (leaks.length > 0) {
    throw new Error(`fixture install not closed; registry-resolved conciv packages:\n${leaks.join('\n')}`)
  }
}

const PACKAGE_CATALOG_ENTRY = /^ {2}'?(\S+?)'?:$/

export function packageCatalogKeys(lockText: string): Set<string> {
  const lines = lockText.split('\n')
  const start = lines.indexOf('packages:')
  if (start === -1) return new Set()
  const end = lines.indexOf('snapshots:', start + 1)
  const slice = lines.slice(start + 1, end === -1 ? undefined : end)
  const keys = new Set<string>()
  for (const line of slice) {
    const match = PACKAGE_CATALOG_ENTRY.exec(line)
    const key = match?.[1]
    if (key === undefined || key.includes('conciv')) continue
    keys.add(key)
  }
  return keys
}

export function assertLockNotDrifted(root: string, lock: PackedLock): void {
  if (!existsSync(lock.path)) return
  const committed = packageCatalogKeys(readFileSync(lock.path, 'utf8'))
  const produced = packageCatalogKeys(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'))
  const added = [...produced].filter((key) => !committed.has(key)).toSorted()
  const removed = [...committed].filter((key) => !produced.has(key)).toSorted()
  if (added.length === 0 && removed.length === 0) return
  const diff = [...added.map((key) => `+ ${key}`), ...removed.map((key) => `- ${key}`)]
  throw new Error(
    [
      'packed fixture install resolved different registry packages than the committed lockfile',
      `${relative(WORKSPACE_ROOT, lock.path)}:`,
      ...diff,
      `run \`${lock.updateCommand}\` to refresh it.`,
    ].join('\n'),
  )
}
