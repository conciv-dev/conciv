import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'

// The widget's browser integration tests (test/**): each boots a tiny Node http server serving the
// real built global bundle + scripted /__pw/* endpoints, then drives the widget in a real Chromium via
// Playwright. Real transport, real browser, real bundle — scripted fixtures, no mocks. A dedicated
// vitest config (taking precedence over vite.config.ts, the lib build) keeps the runner out of the
// build pipeline. Component rendering is covered separately by Storybook stories run as browser tests
// via the Storybook vitest addon — never jsdom.
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// The Storybook browser project is skipped in CI (SKIP_STORYBOOK_TESTS=1): an upstream
// vitest/storybook cold dep-optimize reload race fails it on CI's constrained runners. It runs
// locally via `pnpm test`. TODO: re-enable in CI once the upstream issue is resolved.
const storybook = {
  extends: true as const,
  plugins: [storybookTest({configDir: path.join(dirname, '.storybook')})],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium' as const}],
    },
  },
}

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'widget',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 90_000,
          hookTimeout: 90_000,
        },
      },
      ...(process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook]),
    ],
  },
})
