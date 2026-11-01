import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        test: {
          name: 'it',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/design.it.test.ts', 'test/fixtures/**', 'node_modules/**', 'dist/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'design',
          environment: 'node',
          include: ['test/design.it.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
