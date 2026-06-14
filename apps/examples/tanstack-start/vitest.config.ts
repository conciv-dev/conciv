import {defineConfig} from 'vitest/config'

// Plain node-environment unit tests for the example's pure logic. The aidx vitest runner
// resolves this app's own vitest, so `aidx tools test run` drives exactly these.
export default defineConfig({
  test: {include: ['src/**/*.test.ts']},
})
