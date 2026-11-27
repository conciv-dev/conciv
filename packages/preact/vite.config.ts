import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest({browser: true})],
    environments: {
      server: {
        entries: ['src/preact.ts'],
        external: [/^@conciv\//, 'preact', 'preact/hooks', 'preact/compat', 'solid-js'],
      },
    },
  }),
)
