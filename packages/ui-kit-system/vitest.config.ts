import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

const storybook = {
  extends: true as const,
  plugins: [storybookTest({configDir: path.join(dirname, '.storybook')})],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
    },
  },
}

const browser = {
  plugins: [solidPlugin()],
  test: {
    name: 'browser',
    include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium', launch: {channel: 'chrome'}}],
    },
  },
}

export default defineConfig(
  process.env.SKIP_STORYBOOK_TESTS ? {test: {projects: [browser]}} : {test: {projects: [browser, storybook]}},
)
