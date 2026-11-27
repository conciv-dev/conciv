import {defineConfig, mergeConfig} from 'vite'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  mergeConfig(
    libConfig({
      root: import.meta.url,
      plugins: [experimental(), concivTest({browser: true})],
      environments: {
        server: {entries: ['src/design.ts']},
        client: {},
        types: {entries: ['src/plugin-experimental.tsx'], typesOnly: true},
      },
    }),
    {publicDir: false},
  ),
)
