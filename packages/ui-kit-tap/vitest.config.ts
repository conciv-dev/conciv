import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {browserOptimizeDeps, ciTest, ciTestSolidBrowser, HOOK_TIMEOUT_MS, TEST_TIMEOUT_MS} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: TEST_TIMEOUT_MS,
          hookTimeout: HOOK_TIMEOUT_MS,
        },
      },
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
            provider: playwright({launchOptions: {channel: 'chromium'}}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
    ],
  },
})
