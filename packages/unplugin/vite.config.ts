import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest()],
    environments: {
      server: {
        entries: [
          'src/unplugin.ts',
          'src/vite.ts',
          'src/webpack.ts',
          'src/rspack.ts',
          'src/rollup.ts',
          'src/esbuild.ts',
          'src/nextjs.ts',
          'src/nextjs-edge.ts',
          'src/nextjs-widget.ts',
          'src/core/boot.ts',
          'src/core/widget-start.ts',
          'src/core/vite-bridge.ts',
        ],
        external: ['unplugin', 'vite', 'launch-editor'],
        noExternal: ['@conciv/protocol'],
      },
    },
  }),
)
