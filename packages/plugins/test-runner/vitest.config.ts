import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'plugin-test-runner',
    environment: 'node',
    include: ['test/test-runner.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
})
