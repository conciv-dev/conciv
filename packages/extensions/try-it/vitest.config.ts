import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    globalSetup: ['test/health-server.global.ts'],
    projects: [
      {
        test: {
          name: 'try-it',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        plugins: [solid()],
        resolve: {conditions: ['browser', 'development']},
        test: {
          ...ciTestSolidBrowser(),
          name: 'try-it-browser',
          environment: 'node',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 30_000,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
