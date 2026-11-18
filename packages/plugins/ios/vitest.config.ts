import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'plugin-ios',
    environment: 'node',
    include: ['test/ios.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
})
