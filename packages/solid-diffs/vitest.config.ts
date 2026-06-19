import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'

// The diff renderers touch the real DOM (shadow roots, Shiki), so they are only meaningfully tested
// in a real browser via Storybook stories — never jsdom.
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// The Storybook browser tests are skipped in CI (SKIP_STORYBOOK_TESTS=1): an upstream
// vitest/storybook cold dep-optimize reload race fails them on CI's constrained runners. They run
// locally via `pnpm test`. This package has no node-only tests, so CI passes with no tests.
// TODO: re-enable in CI once the upstream issue is resolved.
export default defineConfig(
  process.env.SKIP_STORYBOOK_TESTS
    ? {test: {include: [], passWithNoTests: true}}
    : {
        test: {
          projects: [
            {
              extends: true,
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
            },
          ],
        },
      },
)
