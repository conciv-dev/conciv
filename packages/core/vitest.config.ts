import {defineConfig} from 'vitest/config'

// Only our own unit + integration tests. The fixtures/ tree holds an app with an
// intentional-fail test that the runner manager executes OUT OF PROCESS — it must never be
// collected by our own run.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    env: process.env.CI && !process.env.MANDARAX_CLAUDE_CLI ? {MANDARAX_CLAUDE_CLI: '1'} : {},
  },
})
