import {defineConfig, devices} from '@playwright/test'
import {E2E_PORTS, type E2EApp} from './ports.js'

export function e2eConfig(app: E2EApp, opts: {command: (port: number) => string}): ReturnType<typeof defineConfig> {
  const port = E2E_PORTS[app]
  const baseURL = `http://localhost:${port}`
  return defineConfig({
    testDir: './tests',
    workers: 1,
    reporter: [['line']],
    use: {baseURL},
    webServer: {
      command: opts.command(port),
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 120_000,
      env: {CONCIV_E2E: '1'},
    },
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  })
}
