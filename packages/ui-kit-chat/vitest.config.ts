import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

const maxWorkers = Number(process.env.VITEST_MAX_WORKERS ?? 3)

const storybook = {
  extends: true as const,
  plugins: [storybookTest({configDir: path.join(dirname, '.storybook')})],
  test: {
    name: 'storybook',
    maxWorkers,
    browser: {
      connectTimeout: 120_000,
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
    },
  },
}

export default defineConfig({
  test: {
    maxWorkers,
    projects: [
      {
        extends: true,
        resolve: {conditions: ['browser', 'development']},
        ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
        test: {
          name: 'ui-kit-chat',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          server: {deps: {inline: ['solid-js']}},
        },
      },
      ...(process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook]),
    ],
  },
})
