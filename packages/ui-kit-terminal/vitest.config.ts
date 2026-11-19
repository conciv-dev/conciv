import {defineConfig} from 'vitest/config'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {playwright} from '@vitest/browser-playwright'
import {browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    globalSetup: [...ciTest().globalSetup, 'test/control-server.global.ts'],
    projects: [
      {
        plugins: [solid(), UnoCSS({content: {filesystem: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}']}})],
        resolve: {conditions: ['browser', 'development']},
        optimizeDeps: browserOptimizeDeps(),
        test: {
          ...ciTestSolidBrowser(),
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
