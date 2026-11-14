import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'builtin-plugins',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
