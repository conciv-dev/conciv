import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'whiteboard',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
