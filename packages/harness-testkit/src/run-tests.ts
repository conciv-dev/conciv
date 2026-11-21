import {spawn} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {createRequire} from 'node:module'
import {homedir, tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {z} from 'zod'
import {isolatedEnv} from './isolated-env.js'

const GoneSchema = z.object({code: z.enum(['ESRCH', 'EPERM'])})

const CpuProfileFolderSchema = z.string().min(1).optional()

const VitestManifestSchema = z.object({bin: z.object({vitest: z.string()})})

function vitestEntry(): string {
  const manifest = createRequire(join(process.cwd(), 'package.json')).resolve('vitest/package.json')
  const {bin} = VitestManifestSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')))
  return join(dirname(manifest), bin.vitest)
}

function playwrightCacheDirectory(env: NodeJS.ProcessEnv): string {
  if (process.platform === 'linux') return env.XDG_CACHE_HOME || join(homedir(), '.cache')
  if (process.platform === 'win32') return env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  return join(homedir(), 'Library', 'Caches')
}

function playwrightBrowsers(env: NodeJS.ProcessEnv): string {
  const chosen =
    env.PLAYWRIGHT_BROWSERS_PATH ??
    env.npm_config_playwright_browsers_path ??
    env.npm_package_config_playwright_browsers_path
  return chosen || join(playwrightCacheDirectory(env), 'ms-playwright')
}

function cpuProfileFlags(env: NodeJS.ProcessEnv): string[] {
  const folder = CpuProfileFolderSchema.parse(env.CONCIV_TEST_CPU_PROF)
  return folder === undefined ? [] : ['--cpu-prof', `--cpu-prof-dir=${resolve(folder)}`]
}

const entry = vitestEntry()
// oxlint-disable-next-line conciv/no-hand-made-temp-dir -- the test process's own home, as opencode's test runner: removed when vitest exits
const home = mkdtempSync(join(tmpdir(), 'conciv-test-home-'))
const temporary = join(home, 'tmp')
mkdirSync(temporary)

const grouped = process.platform !== 'win32'
const child = spawn(process.execPath, [...cpuProfileFlags(process.env), entry, 'run', ...process.argv.slice(2)], {
  detached: grouped,
  env: {...isolatedEnv(process.env, home, temporary), PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsers(process.env)},
  stdio: 'inherit',
})

function signalRun(signal: NodeJS.Signals | 0): boolean {
  if (!grouped || child.pid === undefined) return child.kill(signal)
  try {
    process.kill(-child.pid, signal)
    return true
  } catch (error) {
    if (GoneSchema.safeParse(error).success) return false
    throw error
  }
}

async function removeHomeOnceRunIsGone(): Promise<void> {
  signalRun('SIGKILL')
  while (signalRun(0)) await delay(20)
  rmSync(home, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
}

const interrupt = (): void => {
  signalRun('SIGINT')
}
const terminate = (): void => {
  signalRun('SIGTERM')
}
process.on('SIGINT', interrupt)
process.on('SIGTERM', terminate)
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal === null ? 1 : 128)
  void removeHomeOnceRunIsGone()
})
child.once('error', (error) => {
  rmSync(home, {recursive: true, force: true})
  process.exitCode = 1
  throw error
})
