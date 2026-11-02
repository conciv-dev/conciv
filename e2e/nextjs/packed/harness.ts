import {spawn, type ChildProcess} from 'node:child_process'
import {execFile} from 'node:child_process'
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

import {NON_INTERACTIVE_ENV, WORKSPACE_ROOT, buildAndPack, installPacked, run} from '@conciv/e2e-utils/packed'

const execFileAsync = promisify(execFile)

export const ENGINE_PORT = 41750
const CONCIV_FALLBACK_PORT = 41700
export const DEV_PORT = 41751
export const CLOSURE_ROOTS = ['@conciv/it', '@conciv/extension-tanstack', '@conciv/extension-compiler']
export const FIXTURE_LOCK_PATH = join(WORKSPACE_ROOT, 'e2e/nextjs/packed/fixture-lock.yaml')
const FIXTURE_LOCK = {
  path: FIXTURE_LOCK_PATH,
  updateCommand: 'pnpm --filter conciv-e2e-nextjs run update-packed-lockfile',
}

export const SECOND_SENTINEL = 'CONCIV_FIXTURE_SECOND_SENTINEL'

const DEV_ENDPOINT_DIR = join(tmpdir(), 'conciv-it-dev-endpoint')

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
    `import {defineExtension, getExtensionApi} from '@conciv/extension'`,
    ``,
    `const NAME = 'fixture-second'`,
    ``,
    `function Component() {`,
    `  const slot = getExtensionApi(NAME).useSlot()`,
    `  return slot === 'composer' ? '${SECOND_SENTINEL}' : null`,
    `}`,
    ``,
    `export default defineExtension({name: NAME, Component}).client(() => ({value: {}}))`,
    ``,
  ].join('\n')
}

export type Fixture = {root: string; appDir: string; tgzDir: string; closure: string[]}

export type SetupFixtureOptions = {fresh?: boolean}

function resolveFresh(options: SetupFixtureOptions): boolean {
  return options.fresh ?? process.env.CONCIV_PACKED_FRESH === '1'
}

export async function setupFixture(options: SetupFixtureOptions = {}): Promise<Fixture> {
  const fresh = resolveFresh(options)
  const root = mkdtempSync(join(tmpdir(), 'conciv-packed-fixture-'))
  const tgzDir = join(root, 'tgz')
  mkdirSync(tgzDir, {recursive: true})
  const {overrides, closure} = await buildAndPack(tgzDir, CLOSURE_ROOTS)
  const appDir = join(root, 'packages/app')
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({name: 'fixture-root', version: '0.0.0', private: true}, null, 2),
  )
  writeFixtureFiles(appDir, overrides)
  await installPacked({
    root,
    packages: ['packages/*'],
    allowBuilds: {'isolated-vm': false, sharp: false, protobufjs: false},
    overrides,
    lock: FIXTURE_LOCK,
    fresh,
  })
  return {root, appDir, tgzDir, closure}
}

export function teardownFixture(fixture: Fixture): void {
  rmSync(fixture.root, {recursive: true, force: true})
}

export type NextHandle = {child: ChildProcess; appDir: string; devPort: number; logPath: string}

export type StartNextOptions = {webpack: boolean; devPort: number; instrumentationStatDelayMs?: number}

function writeInstrumentationStatDelay(appDir: string, delayMs: number): string {
  const preloadPath = join(dirname(dirname(appDir)), 'instrumentation-stat-delay.cjs')
  writeFileSync(
    preloadPath,
    [
      `const fs = require('node:fs')`,
      `const lstat = fs.lstat`,
      `fs.lstat = (path, ...rest) => {`,
      `  const callback = rest.pop()`,
      `  const delayed = (...args) => setTimeout(callback, ${delayMs}, ...args)`,
      `  return lstat(path, ...rest, String(path).endsWith('/instrumentation.ts') ? delayed : callback)`,
      `}`,
      ``,
    ].join('\n'),
  )
  return preloadPath
}

export function startNext(appDir: string, options: StartNextOptions): NextHandle {
  rmSync(join(appDir, '.next'), {recursive: true, force: true})
  rmSync(join(appDir, '.conciv'), {recursive: true, force: true})
  const args = ['exec', 'next', 'dev', '--port', String(options.devPort)]
  if (options.webpack) args.push('--webpack')
  const logPath = join(appDir, 'next-dev.log')
  const log = openSync(logPath, 'w')
  const delayMs = options.instrumentationStatDelayMs
  const child = spawn('pnpm', args, {
    cwd: appDir,
    detached: true,
    stdio: ['ignore', log, log],
    env:
      delayMs === undefined
        ? NON_INTERACTIVE_ENV
        : {...NON_INTERACTIVE_ENV, NODE_OPTIONS: `--require ${writeInstrumentationStatDelay(appDir, delayMs)}`},
  })
  closeSync(log)
  return {child, appDir, devPort: options.devPort, logPath}
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

function instrumentationReport(handle: NextHandle): string {
  const path = '.next/dev/server/instrumentation.js'
  return `${path} ${existsSync(join(handle.appDir, path)) ? 'exists' : 'is missing'}`
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
      `conciv engine never listened on ${enginePort}\n${instrumentationReport(handle)}\n--- listening ports ---\n${await listeningSnapshot()}\n--- next dev output ---\n${logTail(handle)}`,
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
