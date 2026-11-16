import {mkdirSync, rmSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'
import {defineConfig, devices, type ReporterDescription} from '@playwright/test'
import {E2E_PORTS, HARNESS_E2E_PORTS, type E2EApp, type HarnessApp} from './ports.js'

const PACKED_SPECS = '**/packed-*.spec.ts'

function e2eStateDir(configDir: string): string {
  return join(dirname(configDir), '.conciv-e2e', basename(configDir))
}

function reporters(configDir: string, appStateFolders: string[]): ReporterDescription[] {
  const cleanup: ReporterDescription = [
    join(import.meta.dirname, 'state-cleanup-reporter.ts'),
    {stateDir: e2eStateDir(configDir), appStateFolders: appStateFolders.map((folder) => join(configDir, folder))},
  ]
  if (!process.env.GITHUB_ACTIONS) return [['line'], cleanup]
  return [['line'], ['json', {outputFile: 'test-results.json'}], cleanup]
}

function legacyStateDir(configDir: string): string {
  return join(configDir, '.conciv-e2e')
}

export function e2eConfigDir(configFile: string | undefined): string {
  if (configFile === undefined) throw new Error('the e2e state folder needs a Playwright config file')
  return dirname(configFile)
}

export function e2eServerLog(configDir: string, port: number): string {
  return join(e2eStateDir(configDir), `server-${port}.log`)
}

function serverEntry(entry: {
  configDir: string
  prepare: string
  command: string
  port: number
  env: {CONCIV_HOME: string} & Record<string, string>
}) {
  return {
    command: `rm -rf '${legacyStateDir(entry.configDir)}' && ${entry.prepare} && (${entry.command}) 2>&1 | tee '${e2eServerLog(entry.configDir, entry.port)}'`,
    url: `http://localhost:${entry.port}`,
    reuseExistingServer: false,
    stdout: 'pipe' as const,
    timeout: 180_000,
    env: entry.env,
  }
}

function freshFolder(folder: string): string {
  return `rm -rf '${folder}' && mkdir -p '${folder}'`
}

function runConcivHome(configDir: string): {CONCIV_HOME: string} {
  const home = join(e2eStateDir(configDir), 'conciv-home')
  process.env.CONCIV_HOME = home
  return {CONCIV_HOME: home}
}

export function emptyE2eState(configDir: string): void {
  rmSync(legacyStateDir(configDir), {recursive: true, force: true})
  rmSync(e2eStateDir(configDir), {recursive: true, force: true})
  mkdirSync(e2eStateDir(configDir), {recursive: true})
}

export function e2eConfig(
  app: E2EApp,
  opts: {dir: string; command: (port: number) => string; timeout?: number},
): ReturnType<typeof defineConfig> {
  const port = E2E_PORTS[app]
  const timeout = opts.timeout ?? 90_000
  return defineConfig({
    testDir: './test',
    testIgnore: PACKED_SPECS,
    workers: 1,
    timeout,
    expect: {timeout},
    reporter: reporters(opts.dir, ['.conciv']),
    use: {baseURL: `http://localhost:${port}`},
    webServer: serverEntry({
      configDir: opts.dir,
      prepare: freshFolder(e2eStateDir(opts.dir)),
      command: `rm -rf .conciv && ${opts.command(port)}`,
      port,
      env: runConcivHome(opts.dir),
    }),
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  })
}

export function packedE2eConfig(opts: {dir: string}): ReturnType<typeof defineConfig> {
  runConcivHome(opts.dir)
  return defineConfig({
    testDir: './test',
    testMatch: PACKED_SPECS,
    globalSetup: join(import.meta.dirname, 'packed-global-setup.ts'),
    workers: 1,
    timeout: 90_000,
    expect: {timeout: 90_000},
    reporter: reporters(opts.dir, []),
    projects: [{name: 'packed', use: {...devices['Desktop Chrome']}}],
  })
}

function isHarnessApp(name: string): name is HarnessApp {
  return Object.hasOwn(HARNESS_E2E_PORTS, name)
}

function selectedHarnesses(): [HarnessApp, number][] {
  const entries = Object.entries(HARNESS_E2E_PORTS) as [HarnessApp, number][]
  const filter = process.env.CONCIV_HARNESS
  if (!filter) return entries
  if (!isHarnessApp(filter)) {
    throw new Error(
      `CONCIV_HARNESS="${filter}" is not a harness; pick one of ${Object.keys(HARNESS_E2E_PORTS).join(', ')}`,
    )
  }
  return entries.filter(([harness]) => harness === filter)
}

export function harnessHome(configDir: string, harness: HarnessApp): string {
  return join(e2eStateDir(configDir), harness)
}

function isolatedHome(configDir: string, harness: HarnessApp): {CONCIV_HOME: string} & Record<string, string> {
  const home = harnessHome(configDir, harness)
  return {HOME: home, CODEX_HOME: join(home, '.codex'), CONCIV_HOME: join(home, '.conciv-home')}
}

export function harnessMatrixConfig(opts: {
  dir: string
  command: (harness: HarnessApp, port: number) => string
}): ReturnType<typeof defineConfig> {
  const entries = selectedHarnesses()
  return defineConfig({
    testDir: './test',
    workers: 1,
    timeout: 150_000,
    reporter: reporters(
      opts.dir,
      entries.map(([harness]) => `.conciv-${harness}`),
    ),
    webServer: entries.map(([harness, port]) =>
      serverEntry({
        configDir: opts.dir,
        prepare: `rm -rf '${harnessHome(opts.dir, harness)}' && mkdir -p '${join(harnessHome(opts.dir, harness), '.codex')}'`,
        command: `rm -rf .conciv-${harness} && ${opts.command(harness, port)}`,
        port,
        env: isolatedHome(opts.dir, harness),
      }),
    ),
    projects: entries.map(([harness, port]) => ({
      name: harness,
      use: {...devices['Desktop Chrome'], baseURL: `http://localhost:${port}`},
    })),
  })
}
