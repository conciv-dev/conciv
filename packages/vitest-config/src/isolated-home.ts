import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'
import {isolatedEnv} from '@internal/vitest-config/isolated-env'

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

const ISOLATED_MARK = 'VITEST_ISOLATED_HOME'

export default function setup(): () => void {
  if (process.env[ISOLATED_MARK] !== undefined) return () => undefined
  // oxlint-disable-next-line conciv/no-hand-made-temp-dir -- the test run's own home, removed in teardown
  const home = mkdtempSync(join(tmpdir(), 'conciv-test-home-'))
  const temporary = join(home, 'tmp')
  mkdirSync(temporary)
  const browsers = playwrightBrowsers(process.env)
  const isolated = {
    ...isolatedEnv(process.env, home, temporary),
    PLAYWRIGHT_BROWSERS_PATH: browsers,
    [ISOLATED_MARK]: home,
  }
  for (const name of Object.keys(process.env)) if (!(name in isolated)) delete process.env[name]
  Object.assign(process.env, isolated)
  return () => rmSync(home, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
}
