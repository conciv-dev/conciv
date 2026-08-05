import {defineConfig} from 'vitest/config'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['init.e2e.test.ts'],
    testTimeout: 60_000,
    reporters: ciReporters(),
  },
})
