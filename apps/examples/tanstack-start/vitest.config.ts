import {defineConfig} from 'vitest/config'

// Plain node-environment unit tests for the example's pure logic. The mandarax vitest runner
// resolves this app's own vitest, so `mandarax tools test run` drives exactly these.
export default defineConfig({
  test: {include: ['src/**/*.test.ts']},
})
