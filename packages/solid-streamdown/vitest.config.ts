import {defineConfig} from 'vitest/config'

import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

const storybook = {
  extends: true as const,
  plugins: [storybookTest({configDir: path.join(dirname, '.storybook')})],
  test: {
    name: 'storybook',
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium'}],
    },
  },
}

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'solid-streamdown',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      ...(process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook]),
    ],
  },
})
