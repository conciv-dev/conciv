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
          name: 'whiteboard',
          environment: 'node',
          include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
          exclude: ['test/**/*.browser.test.tsx', 'node_modules/**', 'dist/**'],
          testTimeout: 60_000,
        },
      },
      {
        plugins: [solid()],
        test: {
          name: 'whiteboard-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 60_000,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
