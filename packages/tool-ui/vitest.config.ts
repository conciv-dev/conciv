import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'

// Pure unit tests (the zod-typed view contract) run in node; component rendering is covered by
// Storybook stories run as browser tests via the Storybook vitest addon — never jsdom.
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
          name: 'tool-ui',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      ...(process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook]),
    ],
  },
})
