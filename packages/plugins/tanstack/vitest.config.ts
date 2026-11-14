import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'plugin-tanstack',
    environment: 'node',
    include: ['test/tanstack.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
})
