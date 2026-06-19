import {defineConfig} from 'vitest/config'

// Unit tests cover only the pure algorithms — block splitting and the rehype animate transform —
// so they run in a plain Node env. Component rendering and streaming behavior are covered by
// Storybook play functions (also vitest, via the Storybook addon), not here, not jsdom.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'
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
