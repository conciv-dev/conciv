import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'

// Component rendering is covered by Storybook stories run as browser tests via the Storybook vitest
// addon — never jsdom.
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// Cap browser workers (overridable via VITEST_MAX_WORKERS) so a local run stays well-behaved.
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
      instances: [{browser: 'chromium'}],
    },
  },
}

export default defineConfig(
  process.env.SKIP_STORYBOOK_TESTS ? {test: {passWithNoTests: true}} : {test: {maxWorkers, projects: [storybook]}},
)
