import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    projects: [
      {
        extends: true,
        test: {name: 'node', include: ['test/**/*.test.ts'], execArgv: ['--expose-gc']},
      },
      {
        extends: true,
        test: {
          name: 'node-quickjs-worker',
          include: ['test/core-api.it.test.ts'],
          execArgv: ['--expose-gc', '--no-addons'],
        },
      },
    ],
  },
})
