import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          ...ciTest(),
          name: 'client',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
})
