import {defineConfig} from 'vitest/config'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/init.e2e.spec.ts'],
    testTimeout: 60_000,
    reporters: ciReporters(),
  },
})
