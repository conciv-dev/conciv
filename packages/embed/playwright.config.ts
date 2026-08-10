import {defineConfig, devices, type ReporterDescription} from '@playwright/test'

function reporters(): ReporterDescription[] {
  if (!process.env.GITHUB_ACTIONS) return [['line']]
  return [['line'], ['json', {outputFile: 'test-results.json'}]]
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.it.test.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {timeout: 30_000},
  reporter: reporters(),
  retries: 0,
  use: {
    trace: 'retain-on-failure',
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
})
