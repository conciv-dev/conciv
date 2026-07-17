import {defineConfig, devices} from '@playwright/test'
import {E2E_PORTS, HARNESS_E2E_PORTS, type E2EApp, type HarnessApp} from './ports.js'

function serverEntry(command: string, port: number) {
  return {
    command,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe' as const,
    timeout: 120_000,
    env: {CONCIV_E2E: '1'},
  }
}

export function e2eConfig(app: E2EApp, opts: {command: (port: number) => string}): ReturnType<typeof defineConfig> {
  const port = E2E_PORTS[app]
  return defineConfig({
    testDir: './tests',
    workers: 1,
    reporter: [['line']],
    use: {baseURL: `http://localhost:${port}`},
    webServer: serverEntry(`rm -rf .conciv && ${opts.command(port)}`, port),
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
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
      `CONCIV_HARNESS="${filter}" is not a harness — pick one of ${Object.keys(HARNESS_E2E_PORTS).join(', ')}`,
    )
  }
  return entries.filter(([harness]) => harness === filter)
}

export function harnessMatrixConfig(opts: {
  command: (harness: HarnessApp, port: number) => string
}): ReturnType<typeof defineConfig> {
  const entries = selectedHarnesses()
  return defineConfig({
    testDir: './tests',
    workers: 1,
    reporter: [['line']],
    webServer: entries.map(([harness, port]) =>
      serverEntry(`rm -rf .conciv-${harness} && ${opts.command(harness, port)}`, port),
    ),
    projects: entries.map(([harness, port]) => ({
      name: harness,
      use: {...devices['Desktop Chrome'], baseURL: `http://localhost:${port}`},
    })),
  })
}
