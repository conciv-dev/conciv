import {fileURLToPath} from 'node:url'
import solid from 'vite-plugin-solid'
import {defineConfig} from 'vitest/config'

const WORKSPACE_SOURCES = ['packages', 'packages/plugins', 'packages/extensions', 'apps'].map(
  (group) => `${group}/*/src/**/*.{ts,tsx}`,
)

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [solid({exclude: ['**/apps/site/**']})],
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
