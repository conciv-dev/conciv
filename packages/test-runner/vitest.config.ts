import {defineConfig} from 'vitest/config'

// The runner package's own test suite. Fixture apps under test/fixtures/** have their own
// vitest/jest/playwright configs and MUST NOT be collected here.
export default defineConfig({
  test: {
    include: ['test/**/*.it.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    testTimeout: 30_000,
  },
})
