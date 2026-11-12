import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        test: {
          name: 'mascot-react',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'mascot-react-browser',
          include: ['test/browser/**/*.browser.test.tsx'],
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
