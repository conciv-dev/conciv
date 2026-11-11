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

export function assertPackAllowed(): void {
  if (process.env.GITHUB_ACTIONS === 'true') return
  throw new Error(
    'packing @conciv tarballs runs only in CI (.github/workflows/packed.yml); it never runs locally. Push the branch and read the Packed workflow run instead.',
  )
}

export function packTarball(packageDir: string, destination: string): string {
  assertPackAllowed()
  const output = execFileSync('pnpm', ['pack', '--pack-destination', destination], {
    cwd: packageDir,
    encoding: 'utf8',
  })
  const tarball = output.trim().split('\n').at(-1)
  if (tarball === undefined || !existsSync(tarball)) throw new Error(`pnpm pack produced no tarball:\n${output}`)
  return tarball
}

export async function buildAndPack(
  tgzDir: string,
  roots: string[],
): Promise<{overrides: Record<string, string>; closure: string[]}> {
  assertPackAllowed()
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

export function releaseAgeYaml(): string[] {
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

export function firewalledPnpm(args: string[]): [string, string[]] {
  assertPackAllowed()
  return ['sfw', ['pnpm', ...args]]
}

export type PackedInstallOptions = {
  root: string
  packages: string[]
  allowBuilds: Record<string, boolean>
  overrides: Record<string, string>
  lockPath?: string
  fresh: boolean
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
  const lockPath = options.fresh ? undefined : options.lockPath
  if (lockPath !== undefined && existsSync(lockPath)) {
    writeFileSync(join(options.root, 'pnpm-lock.yaml'), readFileSync(lockPath, 'utf8'))
  }
  const [command, args] = firewalledPnpm(['install', '--no-frozen-lockfile', '--config.confirmModulesPurge=false'])
  await run(command, args, options.root)
  assertClosed(options.root)
  if (lockPath !== undefined) assertLockNotDrifted(options.root, lockPath)
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
const RESOLUTION_LINE = /^ {4}resolution: \{(.*)\}$/
const PACKED_CONCIV_ENTRY = /^@conciv\/[a-z0-9-]+@file:/

type LockResolutions = Map<string, string>

function packageResolutions(lockText: string): LockResolutions {
  const section = lockText.split('\npackages:\n')[1]?.split('\nsnapshots:\n')[0] ?? ''
  return new Map(section.split('\n\n').flatMap(entryResolution))
}

function entryResolution(block: string): [string, string][] {
  const [head = '', ...body] = block.split('\n').filter((line) => line !== '')
  const key = PACKAGE_CATALOG_ENTRY.exec(head)?.[1]
  const resolution = body.map((line) => RESOLUTION_LINE.exec(line)?.[1]).find((value) => value !== undefined)
  if (key === undefined || resolution === undefined || PACKED_CONCIV_ENTRY.test(key)) return []
  return [[key, resolution]]
}

function resolutionField(resolution: string, field: string): string | undefined {
  return new RegExp(`(?:^|, )${field}: ([^,]+)`).exec(resolution)?.[1]
}

function untrustedResolutions(resolutions: LockResolutions): string[] {
  return [...resolutions].flatMap(([key, resolution]) => {
    const tarball = resolutionField(resolution, 'tarball')
    const remoteTarball = tarball !== undefined && !tarball.startsWith('file:')
    const git = resolutionField(resolution, 'type') === 'git' || resolutionField(resolution, 'commit') !== undefined
    return remoteTarball || git ? [`${key}: {${resolution}}`] : []
  })
}

function integrityOf(resolution: string): string {
  return resolutionField(resolution, 'integrity') ?? resolution
}

function lockDrift(committed: LockResolutions, produced: LockResolutions): string[] {
  const added = [...produced.keys()].filter((key) => !committed.has(key)).map((key) => `+ ${key}`)
  const removed = [...committed.keys()].filter((key) => !produced.has(key)).map((key) => `- ${key}`)
  const changed = [...produced]
    .filter(([key, resolution]) => {
      const before = committed.get(key)
      return before !== undefined && integrityOf(before) !== integrityOf(resolution)
    })
    .map(([key]) => `~ ${key} (integrity changed)`)
  return [...added, ...removed, ...changed].toSorted((left, right) => left.slice(2).localeCompare(right.slice(2)))
}

export function assertLockNotDrifted(root: string, lockPath: string): void {
  if (!existsSync(lockPath)) return
  const produced = packageResolutions(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'))
  const untrusted = untrustedResolutions(produced)
  if (untrusted.length > 0) {
    throw new Error(
      ['packed fixture install resolved packages outside the npm registry (remote tarball or git):', ...untrusted].join(
        '\n',
      ),
    )
  }
  const diff = lockDrift(packageResolutions(readFileSync(lockPath, 'utf8')), produced)
  if (diff.length === 0) return
  throw new Error(
    [
      'packed fixture install resolved different registry packages than the committed lockfile',
      `${relative(WORKSPACE_ROOT, lockPath)}:`,
      ...diff,
      REFRESH_INSTRUCTIONS,
    ].join('\n'),
  )
}

const REFRESH_INSTRUCTIONS = [
  'Refresh it in CI, never locally:',
  '  1. gh workflow run packed.yml --ref <branch> -f update-lockfiles=true',
  '  2. find YOUR dispatch: gh run list --workflow packed.yml --branch <branch> --event workflow_dispatch',
  '  3. gh run download <run-id> -n packed-fixture-locks -D e2e',
  '     (always by the run id of your dispatch: a fork PR can upload a same-named artifact)',
  '  4. before committing, check the diff holds only the expected name@version changes, and no',
  '     tarball or git resolution other than the @conciv/*@file: entries.',
].join('\n')
