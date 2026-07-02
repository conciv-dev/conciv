import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    env: process.env.CI && !process.env.CONCIV_CLAUDE_CLI ? {CONCIV_CLAUDE_CLI: '1'} : {},
  },
})
