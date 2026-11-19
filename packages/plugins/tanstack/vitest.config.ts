import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

const PACKED_TAG = 'packs and installs tarballs; runs only in .github/workflows/packed.yml'

export default defineConfig(({mode}) => ({
  test: {
    ...ciTest(),
    name: 'plugin-tanstack',
    environment: 'node',
    include: ['test/tanstack.test.ts', 'test/tanstack.browser.test.ts'],
    tags: [{name: 'packed', description: PACKED_TAG, skip: mode !== 'packed'}],
    testTimeout: 120_000,
    fileParallelism: false,
  },
}))
