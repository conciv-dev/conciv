import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        esbuild: {jsx: 'automatic', jsxImportSource: 'react'},
        test: {
          ...ciTest(),
          name: 'browser',
          include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
    ],
  },
})
