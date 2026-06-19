import {defineConfig, devices} from '@playwright/test'

// E2E against the running dev server. `mandarax tools test run` (playwright runner) drives these.
// Run locally with `npx playwright install` first; the dev server is auto-started below.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  use: {baseURL: 'http://localhost:3000'},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
