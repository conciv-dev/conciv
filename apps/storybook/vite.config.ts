import path from 'node:path'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'
import {browserOptimizeDeps, ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    coverage: {enabled: false},
    projects: [
      {
        extends: true,
        plugins: [storybookTest({configDir: path.join(import.meta.dirname, 'src', 'storybook')})],
        optimizeDeps: browserOptimizeDeps(['@testing-library/dom']),
        test: {
          name: 'storybook',
          maxWorkers: 2,
          isolate: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                channel: 'chromium',
                args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
              },
              contextOptions: {reducedMotion: 'reduce'},
            }),
            instances: [{browser: 'chromium'}],
          },
        },
      },
    ],
  },
})
