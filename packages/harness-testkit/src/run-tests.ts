import {spawn} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {createRequire} from 'node:module'
import {homedir, tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {isolatedEnv} from './isolated-env.js'

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

const entry = vitestEntry()
// oxlint-disable-next-line conciv/no-hand-made-temp-dir -- the test process's own home, as opencode's test runner: removed when vitest exits
const home = mkdtempSync(join(tmpdir(), 'conciv-test-home-'))
const temporary = join(home, 'tmp')
mkdirSync(temporary)

const child = spawn(process.execPath, [entry, 'run', ...process.argv.slice(2)], {
  env: {...isolatedEnv(process.env, home, temporary), PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsers(process.env)},
  stdio: 'inherit',
})
const interrupt = (): void => {
  child.kill('SIGINT')
}
const terminate = (): void => {
  child.kill('SIGTERM')
}
process.once('SIGINT', interrupt)
process.once('SIGTERM', terminate)
child.once('exit', (code, signal) => {
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', terminate)
  rmSync(home, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  process.exitCode = code ?? (signal === null ? 1 : 128)
})
child.once('error', (error) => {
  rmSync(home, {recursive: true, force: true})
  process.exitCode = 1
  throw error
})
