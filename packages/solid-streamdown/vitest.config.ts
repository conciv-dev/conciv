import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'solid-streamdown',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
