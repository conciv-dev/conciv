import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'extension-testkit',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
