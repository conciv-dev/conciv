import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'

// Component rendering is covered by Storybook stories run as browser tests via the Storybook vitest
// addon — never jsdom. The kit has no node-only unit tests yet (pure presentational primitives).
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// The Storybook browser project is skipped in CI (SKIP_STORYBOOK_TESTS=1): an upstream
// vitest/storybook cold dep-optimize reload race fails it on CI's constrained runners. It runs
// locally via `pnpm test`.
const storybook = {
  extends: true as const,
  plugins: [storybookTest({configDir: path.join(dirname, '.storybook')})],
  test: {
    name: 'storybook',
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
    projects: process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook],
  },
})
