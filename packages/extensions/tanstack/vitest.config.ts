import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const PACKED_TAG = 'packs and installs tarballs; runs only in .github/workflows/packed.yml'

export default defineConfig(({mode}) => ({
  test: {
    ...ciTest(),
    tags: [{name: 'packed', description: PACKED_TAG, skip: mode !== 'packed'}],
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
          ...ciTestSolidBrowser(),
          name: 'tanstack-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 60_000,
          fileParallelism: false,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
}))
