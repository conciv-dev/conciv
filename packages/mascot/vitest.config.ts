import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const PACKED_TAG = 'packs and installs tarballs; runs only in .github/workflows/packed.yml'

export default defineConfig(({mode}) => ({
  resolve: {conditions: ['browser', 'development']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    ...ciTest(),
    tags: [{name: 'packed', description: PACKED_TAG, skip: mode !== 'packed'}],
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
    ],
  },
}))
