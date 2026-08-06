import {spawn, type ChildProcess} from 'node:child_process'
import {execFile, execFileSync} from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
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
export const ENGINE_PORT = 41750
const CONCIV_FALLBACK_PORT = 41700
export const DEV_PORT = 41751
export const CLOSURE_ROOTS = ['@conciv/it', '@conciv/extension-tanstack', '@conciv/extension-compiler']

export const SECOND_SENTINEL = 'CONCIV_FIXTURE_SECOND_SENTINEL'

const DEV_ENDPOINT_DIR = join(tmpdir(), 'conciv-it-dev-endpoint')

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
    const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), manifestPath)
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

export function computeClosure(): string[] {
  return closureOf(workspacePackages(), CLOSURE_ROOTS)
}

const NON_INTERACTIVE_ENV = {...process.env, CI: 'true'}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  try {
    await execFileAsync(command, args, {cwd, env: NON_INTERACTIVE_ENV, maxBuffer: 64 * 1024 * 1024})
  } catch (error) {
    const stdout = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stdout') ?? '') : ''
    const stderr = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stderr') ?? '') : ''
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${stdout}\n${stderr}`, {cause: error})
  }
}

export async function buildAndPack(): Promise<{tgzDir: string; overrides: Record<string, string>; closure: string[]}> {
  const byName = workspacePackages()
  const closure = closureOf(byName, CLOSURE_ROOTS)
  await run('pnpm', ['turbo', 'run', 'build', ...closure.flatMap((name) => ['--filter', name])], WORKSPACE_ROOT)
  const tgzDir = mkdtempSync(join(tmpdir(), 'conciv-packed-tgz-'))
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
  return {tgzDir, overrides, closure}
}

function writeFixtureFiles(appDir: string, overrides: Record<string, string>): void {
  mkdirSync(join(appDir, 'app'), {recursive: true})
  mkdirSync(join(appDir, 'conciv/extensions'), {recursive: true})
  const dep = (name: string): string => {
    const value = overrides[name]
    if (value === undefined) throw new Error(`fixture dependency ${name} missing from overrides`)
    return value
  }
  const appManifest = {
    name: 'fixture-app',
    version: '0.0.0',
    private: true,
    scripts: {dev: 'next dev', build: 'next build'},
    dependencies: {
      '@conciv/it': dep('@conciv/it'),
      '@conciv/extension': dep('@conciv/extension'),
      '@conciv/extension-tanstack': dep('@conciv/extension-tanstack'),
      '@conciv/extension-compiler': dep('@conciv/extension-compiler'),
      next: '16.2.10',
      react: '19.2.4',
      'react-dom': '19.2.4',
      'solid-js': '^1.9.13',
    },
    devDependencies: {typescript: '5.9.2', '@types/react': '^19', '@types/node': '^20'},
  }
  writeFileSync(join(appDir, 'package.json'), JSON.stringify(appManifest, null, 2))
  writeFileSync(
    join(appDir, 'next.config.ts'),
    [
      `import {withConciv} from '@conciv/it/plugin/nextjs'`,
      `export default withConciv({typescript: {ignoreBuildErrors: true}}, {port: ${ENGINE_PORT}, devEndpointDir: ${JSON.stringify(DEV_ENDPOINT_DIR)}})`,
      ``,
    ].join('\n'),
  )
  writeFileSync(
    join(appDir, 'instrumentation.ts'),
    [
      `import {register as concivRegister} from '@conciv/it/plugin/nextjs'`,
      `export async function register(): Promise<void> {`,
      `  console.error('[fixture] register called pid', process.pid, process.env.NEXT_RUNTIME, process.env.NODE_ENV, process.env.CONCIV_OPTIONS)`,
      `  process.on('exit', (code) => console.error('[fixture] pid', process.pid, 'exit', code))`,
      `  const port = JSON.parse(process.env.CONCIV_OPTIONS ?? '{}').port ?? 41700`,
      `  const probe = setInterval(async () => {`,
      `    const status = await fetch('http://127.0.0.1:' + port + '/').then((r) => r.status, (e) => 'ERR ' + e?.cause?.code)`,
      `    console.error('[fixture] pid', process.pid, 'engine probe', status)`,
      `  }, 10_000)`,
      `  probe.unref()`,
      `  try {`,
      `    await concivRegister()`,
      `    console.error('[fixture] register resolved pid', process.pid)`,
      `  } catch (error) {`,
      `    console.error('[fixture] register threw', error)`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  )
  writeFileSync(join(appDir, 'instrumentation-client.ts'), `import '@conciv/it/plugin/nextjs/widget'\n`)
  writeFileSync(
    join(appDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: false,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          incremental: true,
          plugins: [{name: 'next'}],
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(appDir, 'app/layout.tsx'),
    `export default function RootLayout({children}: {children: React.ReactNode}) {\n  return (<html lang="en"><body>{children}</body></html>)\n}\n`,
  )
  writeFileSync(
    join(appDir, 'app/page.tsx'),
    `export default function Home() { return <h1 id="ready">fixture-ready</h1> }\n`,
  )
  writeFileSync(join(appDir, 'conciv/extensions/tanstack.tsx'), `export {default} from '@conciv/extension-tanstack'\n`)
}

export function secondExtensionSource(): string {
  return [
    `import {defineExtension, getHostApi} from '@conciv/extension'`,
    ``,
    `function Component() {`,
    `  const slot = getHostApi().useSlot()`,
    `  return slot === 'composer' ? '${SECOND_SENTINEL}' : null`,
    `}`,
    ``,
    `export default defineExtension({name: 'fixture-second', Component}).client(() => ({value: {}}))`,
    ``,
  ].join('\n')
}

export type Fixture = {root: string; appDir: string; tgzDir: string; closure: string[]}

export async function setupFixture(): Promise<Fixture> {
  const {tgzDir, overrides, closure} = await buildAndPack()
  const root = mkdtempSync(join(tmpdir(), 'conciv-packed-fixture-'))
  const appDir = join(root, 'packages/app')
  const workspaceYaml = [
    'packages:',
    "  - 'packages/*'",
    'allowBuilds:',
    '  isolated-vm: false',
    '  sharp: false',
    'overrides:',
    ...Object.entries(overrides).map(([name, value]) => `  '${name}': '${value}'`),
    '',
  ].join('\n')
  writeFileSync(join(root, 'pnpm-workspace.yaml'), workspaceYaml)
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({name: 'fixture-root', version: '0.0.0', private: true}, null, 2),
  )
  writeFixtureFiles(appDir, overrides)
  await run('pnpm', ['install', '--config.confirmModulesPurge=false'], root)
  assertClosed(root)
  return {root, appDir, tgzDir, closure}
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

export function teardownFixture(fixture: Fixture): void {
  rmSync(fixture.root, {recursive: true, force: true})
  rmSync(fixture.tgzDir, {recursive: true, force: true})
}

export type NextHandle = {child: ChildProcess; devPort: number; logPath: string}

export function startNext(appDir: string, options: {webpack: boolean; devPort: number}): NextHandle {
  rmSync(join(appDir, '.next'), {recursive: true, force: true})
  rmSync(join(appDir, '.conciv'), {recursive: true, force: true})
  const args = ['exec', 'next', 'dev', '--port', String(options.devPort)]
  if (options.webpack) args.push('--webpack')
  const logPath = join(appDir, 'next-dev.log')
  const log = openSync(logPath, 'w')
  const child = spawn('pnpm', args, {
    cwd: appDir,
    detached: true,
    stdio: ['ignore', log, log],
    env: NON_INTERACTIVE_ENV,
  })
  closeSync(log)
  return {child, devPort: options.devPort, logPath}
}

async function listeningSnapshot(): Promise<string> {
  const defaultPortListening = await isListening(CONCIV_FALLBACK_PORT)
  const snapshot = await lsofSnapshot()
  return `engine default port ${CONCIV_FALLBACK_PORT} listening: ${defaultPortListening}\n${snapshot}`
}

async function lsofSnapshot(): Promise<string> {
  try {
    const {stdout} = await execFileAsync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'])
    return stdout
  } catch (error) {
    const stdout = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stdout') ?? '') : ''
    if (stdout !== '') return stdout
    return '(lsof snapshot unavailable)'
  }
}

function logTail(handle: NextHandle): string {
  try {
    return readFileSync(handle.logPath, 'utf8').slice(-6000)
  } catch {
    return '(no next dev log captured)'
  }
}

async function isListening(port: number): Promise<boolean> {
  const [socketReachable, processFound] = await Promise.all([canConnect(port), lsofFinds(port)])
  return socketReachable || processFound
}

async function canConnect(port: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    await fetch(`http://127.0.0.1:${port}/`, {signal: controller.signal})
    return true
  } catch {
    return controller.signal.aborted
  } finally {
    clearTimeout(timer)
  }
}

async function lsofFinds(port: number): Promise<boolean> {
  try {
    const {stdout} = await execFileAsync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function httpStatus(url: string): Promise<number> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const response = await fetch(url, {signal: controller.signal})
    clearTimeout(timer)
    return response.status
  } catch {
    return 0
  }
}

export async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error('waitFor timed out')
}

export async function waitReady(handle: NextHandle, enginePort: number): Promise<void> {
  try {
    await waitFor(async () => (await httpStatus(`http://localhost:${handle.devPort}/`)) === 200, 180_000)
  } catch (error) {
    throw new Error(`next dev never served / 200\n--- next dev output ---\n${logTail(handle)}`, {cause: error})
  }
  try {
    await waitFor(() => isListening(enginePort), 180_000)
  } catch (error) {
    throw new Error(
      `conciv engine never listened on ${enginePort}\n--- listening ports ---\n${await listeningSnapshot()}\n--- next dev output ---\n${logTail(handle)}`,
      {cause: error},
    )
  }
}

export async function killPort(port: number): Promise<void> {
  try {
    const {stdout} = await execFileAsync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    for (const pid of stdout.trim().split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGKILL')
      } catch {
        continue
      }
    }
  } catch {
    return
  }
}

export async function stopNext(handle: NextHandle, enginePort: number): Promise<void> {
  if (handle.child.pid !== undefined) {
    try {
      process.kill(-handle.child.pid, 'SIGKILL')
    } catch {
      try {
        handle.child.kill('SIGKILL')
      } catch {
        void 0
      }
    }
  }
  await killPort(handle.devPort)
  await killPort(enginePort)
  await new Promise((resolve) => setTimeout(resolve, 1500))
}

export function readGeneratedEntry(appDir: string): string {
  const path = join(appDir, '.conciv/extensions-client.gen.tsx')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export function writeSecondExtension(appDir: string): void {
  writeFileSync(join(appDir, 'conciv/extensions/second.tsx'), secondExtensionSource())
}

export function removeSecondExtension(appDir: string): void {
  rmSync(join(appDir, 'conciv/extensions/second.tsx'), {force: true})
}

export async function buildProd(appDir: string): Promise<void> {
  rmSync(join(appDir, '.next'), {recursive: true, force: true})
  rmSync(join(appDir, '.conciv'), {recursive: true, force: true})
  await run('pnpm', ['exec', 'next', 'build'], appDir)
}

type RouteBundleEntry = {route: string; firstLoadChunkPaths?: string[]}

function isRouteBundleEntry(value: unknown): value is RouteBundleEntry {
  if (typeof value !== 'object' || value === null || !('route' in value) || typeof value.route !== 'string')
    return false
  if (!('firstLoadChunkPaths' in value)) return true
  const paths = value.firstLoadChunkPaths
  return Array.isArray(paths) && paths.every((item) => typeof item === 'string')
}

export function prodConcivChunkHits(appDir: string, markers: string[]): string[] {
  const statsPath = join(appDir, '.next/diagnostics/route-bundle-stats.json')
  if (!existsSync(statsPath)) {
    throw new Error(`missing Turbopack diagnostic ${statsPath}; route-bundle-stats schema may have changed`)
  }
  const stats: unknown = JSON.parse(readFileSync(statsPath, 'utf8'))
  if (typeof stats !== 'object' || stats === null) {
    throw new Error(`route-bundle-stats.json is not an object; schema may have changed`)
  }
  const entry = Object.values(stats).find(
    (candidate): candidate is RouteBundleEntry => isRouteBundleEntry(candidate) && candidate.route === '/',
  )
  if (entry === undefined || entry.firstLoadChunkPaths === undefined) {
    throw new Error('route-bundle-stats.json has no "/" route firstLoadChunkPaths; schema may have changed')
  }
  const hits: string[] = []
  for (const relative of entry.firstLoadChunkPaths) {
    const chunkPath = join(appDir, relative)
    if (!existsSync(chunkPath)) continue
    const source = readFileSync(chunkPath, 'utf8')
    for (const marker of markers) if (source.includes(marker)) hits.push(`${marker} in ${relative}`)
  }
  return hits
}

export function packedServerModule(fixture: Fixture): string {
  const base = join(fixture.root, 'node_modules/.pnpm')
  const dirs = readdirSync(base).filter((name) => name.startsWith('@conciv+extension-tanstack@'))
  for (const dir of dirs) {
    const serverPath = join(base, dir, 'node_modules/@conciv/extension-tanstack/dist/server.js')
    if (existsSync(serverPath)) return readFileSync(serverPath, 'utf8')
  }
  throw new Error('packed @conciv/extension-tanstack/dist/server.js not found in fixture')
}
