import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import {ciTest} from '@conciv/vitest-config'

const PACKED_TAG = 'packs and installs tarballs; runs only in .github/workflows/packed.yml'

export default defineConfig(({mode}) => ({
  test: {
    ...ciTest(),
    tags: [{name: 'packed', description: PACKED_TAG, skip: mode !== 'packed'}],
    projects: [
      {
        extends: true,
        test: {
          name: 'mascot-react',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'mascot-react-browser',
          include: ['test/browser/**/*.browser.test.tsx'],
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
