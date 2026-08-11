import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
        },
      },
      {
        esbuild: {jsx: 'automatic', jsxImportSource: 'react'},
        test: {
          ...ciTest(),
          name: 'browser',
          include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
          exclude: ['test/**/*.solid.browser.test.tsx'],
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
        plugins: [solidPlugin()],
        resolve: {conditions: ['browser', 'development']},
        test: {
          ...ciTestSolidBrowser(),
          name: 'browser-solid',
          include: ['test/**/*.solid.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
    ],
  },
})
