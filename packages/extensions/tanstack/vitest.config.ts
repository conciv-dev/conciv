import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          name: 'tanstack',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/host/**', 'node_modules/**', 'dist/**'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
})
