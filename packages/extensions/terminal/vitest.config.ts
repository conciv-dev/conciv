import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    reporters: ciReporters(),
    globalSetup: ['test/browser-server.global.ts'],
    projects: [
      {
        test: {
          name: 'terminal',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'terminal-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 60_000,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
