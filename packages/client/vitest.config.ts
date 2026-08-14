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
          include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
          exclude: ['test/reachability.test.ts'],
        },
      },
      {
        resolve: {conditions: ['browser', 'development']},
        ssr: {resolve: {conditions: ['browser', 'development']}},
        test: {
          ...ciTest(),
          name: 'client-solid',
          environment: 'node',
          server: {deps: {inline: ['solid-js']}},
          include: ['test/reachability.test.ts'],
        },
      },
    ],
  },
})
