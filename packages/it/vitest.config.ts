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
          exclude: ['node_modules/**', 'dist/**'],
        },
      },
    ],
  },
})
