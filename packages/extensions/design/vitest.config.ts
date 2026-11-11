import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        test: {
          name: 'design',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
