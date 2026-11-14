import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'plugin-recorder',
    environment: 'node',
    include: ['test/recorder.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
})
