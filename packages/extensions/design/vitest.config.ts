import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'design',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
