import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.it.test.ts'],
  },
})
