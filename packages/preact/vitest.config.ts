import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

const base = ciTest()

export default defineConfig({
  test: {
    ...base,
    coverage: {...base.coverage, include: ['src/**/*.ts']},
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
})
