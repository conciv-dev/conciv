import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    globalSetup: ['test/control-server.global.ts'],
    projects: [
      {
        plugins: [solid()],
        resolve: {conditions: ['browser', 'development']},
        test: {
          name: 'ui-kit-terminal',
          environment: 'node',
          maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 3),
          include: ['test/**/*.test.tsx'],
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
