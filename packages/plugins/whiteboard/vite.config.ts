import {defineConfig, mergeConfig} from 'vitest/config'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import conciv from '@conciv/unplugin/vite'
import UnoCSS from 'unocss/vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(({mode}) =>
  mergeConfig(
    libConfig({
      root: import.meta.url,
      plugins: [UnoCSS(), experimental(), conciv(), concivTest({browser: true})],
      environments: {
        server: {entries: ['src/whiteboard.ts', 'src/rpc.ts']},
        client: {},
        types: {entries: ['src/plugin-experimental.tsx'], typesOnly: true},
      },
    }),
    {
      publicDir: false,
      define: {
        'process.env.IS_PREACT': JSON.stringify('false'),
        ...(mode === 'test' ? {} : {'process.env.NODE_ENV': JSON.stringify('production')}),
      },
    },
  ),
)
