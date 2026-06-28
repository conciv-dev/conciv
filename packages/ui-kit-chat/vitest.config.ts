import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'

// Pure unit tests (grouping/pairing contract) run in node; component rendering is covered by
// Storybook stories run as browser tests via the Storybook vitest addon — never jsdom.
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// Each storybook test file runs in its own headless chromium; vitest otherwise sizes the pool to the
// core count, so a 12-core machine spawns ~11 browsers and pins every CPU. Cap it (overridable via
// VITEST_MAX_WORKERS) so a local run stays well-behaved next to a running Storybook dev server.
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

export default defineConfig({
  test: {
    maxWorkers,
    projects: [
      {
        extends: true,
        test: {
          name: 'ui-kit-chat',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      ...(process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook]),
    ],
  },
})
