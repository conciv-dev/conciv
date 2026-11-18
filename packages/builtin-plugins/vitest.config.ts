import {defineConfig} from 'vitest/config'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
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
        plugins: [solidPlugin(), UnoCSS()],
        resolve: {conditions: ['browser', 'development']},
        optimizeDeps: {
          include: [
            '@zumer/snapdom',
            '@solid-primitives/map',
            '@tanstack/hotkeys',
            '@tanstack/solid-pacer',
            'ai-motion',
            'effect',
          ],
        },
        test: {
          ...browserTest,
          name: 'browser',
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
      {
        plugins: [solidPlugin(), UnoCSS()],
        resolve: {conditions: ['browser', 'development']},
        optimizeDeps: {
          include: [
            '@zumer/snapdom',
            '@solid-primitives/map',
            '@tanstack/hotkeys',
            '@tanstack/solid-pacer',
            'ai-motion',
            'effect',
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
