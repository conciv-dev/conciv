import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'whiteboard',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
