import {defineConfig} from '@playwright/test'

// Boots the example's `next dev` and drives it in a real browser. The mandarax engine boots in-process
// via instrumentation.ts on the fixed port 41700; Playwright kills the dev server tree on teardown,
// which frees that port too. Uses port 3100 to avoid clashing with a hand-run dev server on 3000.
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  use: {baseURL: 'http://localhost:3100'},
  webServer: {
    command: 'pnpm dev -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
