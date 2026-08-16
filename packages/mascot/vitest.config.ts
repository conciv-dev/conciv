import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

export default defineConfig({
  resolve: {conditions: ['browser', 'development']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        test: {
          name: 'mascot',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          testTimeout: ciTest().testTimeout,
          hookTimeout: ciTest().hookTimeout,
        },
      },
      {
        extends: true,
        plugins: [solidPlugin()],
        test: {
          ...ciTestSolidBrowser(),
          name: 'mascot-browser',
          include: ['tests/browser/solid-*.browser.test.tsx'],
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
        extends: true,
        esbuild: {jsx: 'automatic', jsxImportSource: 'react'},
        test: {
          ...ciTest(),
          name: 'mascot-react-browser',
          include: ['tests/browser/react-*.browser.test.tsx'],
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
