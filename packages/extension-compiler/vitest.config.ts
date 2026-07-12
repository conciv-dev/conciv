import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.it.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
  },
})
