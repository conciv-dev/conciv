import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const browserTest = {
  ...ciTestSolidBrowser(),
  include: ['test/**/*.browser.test.tsx'],
  fileParallelism: false,
}

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          ...ciTest(),
          name: 'builtin-plugins',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        plugins: [solidPlugin()],
        resolve: {conditions: ['browser', 'development']},
        optimizeDeps: {
          include: [
            '@zumer/snapdom',
            '@solid-primitives/map',
            '@tanstack/hotkeys',
            '@tanstack/solid-pacer',
            'ai-motion',
          ],
        },
        test: {
          ...browserTest,
          name: 'browser',
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
      {
        plugins: [solidPlugin()],
        resolve: {conditions: ['browser', 'development']},
        optimizeDeps: {
          include: [
            '@zumer/snapdom',
            '@solid-primitives/map',
            '@tanstack/hotkeys',
            '@tanstack/solid-pacer',
            'ai-motion',
          ],
        },
        test: {
          ...browserTest,
          name: 'browser-firefox',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({contextOptions: {deviceScaleFactor: 2}}),
            instances: [{browser: 'firefox'}],
          },
        },
      },
    ],
  },
})
