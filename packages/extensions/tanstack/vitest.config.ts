import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          name: 'tanstack',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/host/**', 'test/**/*.browser.test.tsx', 'node_modules/**', 'dist/**'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'tanstack-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 60_000,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
