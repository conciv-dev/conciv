import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        plugins: [solidPlugin()],
        optimizeDeps: browserOptimizeDeps(),
        test: {
          ...ciTestSolidBrowser(),
          name: 'browser',
          include: ['test/**/*.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/plugin.test.ts', 'test/shared-events.test.ts'],
          testTimeout: ciTest().testTimeout,
          hookTimeout: ciTest().hookTimeout,
        },
      },
    ],
  },
})
