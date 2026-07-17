import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {environment: 'node', include: ['test/**/*.it.test.ts'], testTimeout: 180_000},
})
