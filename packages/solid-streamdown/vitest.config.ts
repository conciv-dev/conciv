import {defineConfig} from 'vitest/config'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    reporters: ciReporters(),
    name: 'solid-streamdown',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
