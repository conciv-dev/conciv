import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {ciReporters} from '@conciv/vitest-config'

export default defineConfig({
  plugins: [solid()],
  resolve: {conditions: ['browser', 'development']},
  test: {
    reporters: ciReporters(),
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
})
