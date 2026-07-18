import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'
import {ciTest} from '@conciv/vitest-config'

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        extends: true,
        plugins: [storybookTest({configDir: path.join(dirname, '.storybook')})],
        test: {
          name: 'storybook',
          maxWorkers: 2,
          testTimeout: 60_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
                launch: {
                  channel: 'chrome',
                  args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
                },
              },
            ],
          },
        },
      },
    ],
  },
})
