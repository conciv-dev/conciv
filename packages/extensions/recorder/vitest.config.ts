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
          name: 'recorder',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/fixtures/**', 'test/**/*.browser.test.tsx', 'node_modules/**', 'dist/**'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'recorder-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 60_000,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
