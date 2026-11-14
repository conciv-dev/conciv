import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'plugin-whiteboard',
    environment: 'node',
    include: ['test/whiteboard.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
})
