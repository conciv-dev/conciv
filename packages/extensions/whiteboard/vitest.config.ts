import {defineConfig} from 'vitest/config'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    reporters: ciReporters(),
    name: 'whiteboard',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
