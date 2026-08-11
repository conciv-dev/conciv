import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

export default defineConfig({
  resolve: {conditions: ['browser', 'development']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        plugins: [solidPlugin()],
        optimizeDeps: browserOptimizeDeps(),
        test: {
          ...ciTestSolidBrowser(),
          name: 'solid-stick-to-bottom-browser',
          include: ['test/**/*.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
          },
        },
      },
    ],
  },
})
