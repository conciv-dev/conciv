import {defineConfig} from 'vitest/config'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.it.test.ts'],
    testTimeout: 180_000,
    reporters: ciReporters(),
  },
})
