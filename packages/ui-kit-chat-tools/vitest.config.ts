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
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
    },
  },
}

const unit = {
  extends: true as const,
  test: {
    name: 'ui-kit-chat-tools',
    environment: 'node' as const,
    include: ['test/**/*.test.ts'],
  },
}

export default defineConfig(
  process.env.SKIP_STORYBOOK_TESTS
    ? {test: {maxWorkers, projects: [unit]}}
    : {test: {maxWorkers, projects: [unit, storybook]}},
)
