import {join} from 'node:path'
import {defineConfig, devices, type ReporterDescription} from '@playwright/test'
import {E2E_PORTS, HARNESS_E2E_PORTS, type E2EApp, type HarnessApp} from './ports.js'

const PACKED_SPECS = '**/packed-*.spec.ts'

function reporters(): ReporterDescription[] {
  if (!process.env.GITHUB_ACTIONS) return [['line']]
  return [['line'], ['json', {outputFile: 'test-results.json'}]]
}

function playwrightOutputDir(configDir: string): string {
  return join(configDir, 'test-results')
}

export function e2eServerLog(outputDir: string, port: number): string {
  return join(outputDir, `server-${port}.log`)
}

function serverEntry(
  outputDir: string,
  command: string,
  port: number,
  env: {CONCIV_HOME: string} & Record<string, string>,
) {
  return {
    command: `mkdir -p '${outputDir}' && (${command}) 2>&1 | tee '${e2eServerLog(outputDir, port)}'`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe' as const,
    timeout: 180_000,
    env,
  }
}

function runConcivHome(outputDir: string): {CONCIV_HOME: string} {
  const home = join(outputDir, 'conciv-home')
  process.env.CONCIV_HOME = home
  return {CONCIV_HOME: home}
}

export function e2eConfig(
  app: E2EApp,
  opts: {dir: string; command: (port: number) => string; timeout?: number; reuseExistingServer?: boolean},
): ReturnType<typeof defineConfig> {
  const port = E2E_PORTS[app]
  const timeout = opts.timeout ?? 90_000
  const outputDir = playwrightOutputDir(opts.dir)
  return defineConfig({
    testDir: './test',
    testIgnore: PACKED_SPECS,
    outputDir,
    workers: 1,
    timeout,
    expect: {timeout},
    reporter: reporters(),
    use: {baseURL: `http://localhost:${port}`},
    webServer: {
      ...serverEntry(outputDir, `rm -rf .conciv && ${opts.command(port)}`, port, runConcivHome(outputDir)),
      ...(opts.reuseExistingServer === undefined ? {} : {reuseExistingServer: opts.reuseExistingServer}),
    },
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  })
}

export function packedE2eConfig(opts: {dir: string}): ReturnType<typeof defineConfig> {
  const outputDir = playwrightOutputDir(opts.dir)
  runConcivHome(outputDir)
  return defineConfig({
    testDir: './test',
    testMatch: PACKED_SPECS,
    outputDir,
    workers: 1,
    timeout: 90_000,
    expect: {timeout: 90_000},
    reporter: reporters(),
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

export function harnessHome(outputDir: string, harness: HarnessApp): string {
  return join(outputDir, `${harness}-home`)
}

function isolatedHome(outputDir: string, harness: HarnessApp): {CONCIV_HOME: string} & Record<string, string> {
  const home = harnessHome(outputDir, harness)
  return {HOME: home, CODEX_HOME: join(home, '.codex'), CONCIV_HOME: join(home, '.conciv-home')}
}

export function harnessMatrixConfig(opts: {
  dir: string
  command: (harness: HarnessApp, port: number) => string
}): ReturnType<typeof defineConfig> {
  const entries = selectedHarnesses()
  const outputDir = playwrightOutputDir(opts.dir)
  return defineConfig({
    testDir: './test',
    outputDir,
    workers: 1,
    timeout: 150_000,
    reporter: reporters(),
    webServer: entries.map(([harness, port]) =>
      serverEntry(
        outputDir,
        `rm -rf .conciv-${harness} && mkdir -p '${join(harnessHome(outputDir, harness), '.codex')}' && ${opts.command(harness, port)}`,
        port,
        isolatedHome(outputDir, harness),
      ),
    ),
    projects: entries.map(([harness, port]) => ({
      name: harness,
      use: {...devices['Desktop Chrome'], baseURL: `http://localhost:${port}`},
    })),
  })
}
