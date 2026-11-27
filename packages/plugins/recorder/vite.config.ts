import {defineConfig} from 'vite'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import UnoCSS from 'unocss/vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [UnoCSS(), experimental(), concivTest({browser: true})],
    environments: {
      server: {entries: ['src/recorder.ts', 'src/rpc.ts']},
      client: {},
      types: {entries: ['src/plugin-experimental.tsx'], typesOnly: true},
    },
  }),
)
