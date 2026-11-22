import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import solid from 'vite-plugin-solid'
import {defineConfig} from 'vitest/config'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

const WORKSPACE_SOURCES = ['packages', 'packages/plugins', 'packages/extensions', 'apps'].map(
  (group) => `${group}/*/src/**/*.{ts,tsx}`,
)

const siteRequire = createRequire(join(ROOT, 'apps/site/package.json'))

export default defineConfig({
  root: ROOT,
  plugins: [solid({exclude: ['**/apps/site/**']})],
  resolve: {alias: {'@brand-assets': dirname(siteRequire.resolve('@conciv/brand/logos.json'))}},
  test: {
    environment: 'node',
    include: [],
    passWithNoTests: true,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['lcovonly'],
      reportsDirectory: 'untested-sources',
      include: WORKSPACE_SOURCES,
      exclude: ['**/*.test.*', '**/*.stories.*'],
    },
  },
})
