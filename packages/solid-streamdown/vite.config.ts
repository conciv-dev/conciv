import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [solid(), concivTest()],
    environments: {
      client: {
        entries: ['src/solid-streamdown.tsx'],
        external: ['solid-js', 'solid-js/web', 'solid-js/store'],
      },
    },
  }),
)
