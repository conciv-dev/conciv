import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'plugin-try-it',
    environment: 'node',
    include: ['test/try-it.test.ts', 'test/try-it.browser.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
})
