import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

function localForkCap(): {maxWorkers?: number} {
  if (process.env.GITHUB_ACTIONS !== undefined) return {}
  const cap = Number(process.env.VITEST_MAX_FORKS)
  if (Number.isInteger(cap) && cap >= 1) return {}
  return {maxWorkers: 3}
}

export default defineConfig({
  test: {
    ...ciTest(),
    ...localForkCap(),
    projects: [
      {
        test: {
          ...localForkCap(),
          name: 'whiteboard',
          environment: 'node',
          include: ['test/**/*.test.ts', 'test/**/*.it.test.ts'],
          exclude: ['test/**/*.browser.test.tsx', 'node_modules/**', 'dist/**'],
          testTimeout: 200_000,
        },
      },
      {
        plugins: [solid()],
        test: {
          ...ciTest(),
          ...localForkCap(),
          name: 'whiteboard-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 200_000,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
