import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'recorder',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
