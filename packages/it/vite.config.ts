import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    environments: {
      server: {
        entries: [
          'src/plugin/vite.ts',
          'src/plugin/webpack.ts',
          'src/plugin/rspack.ts',
          'src/plugin/rollup.ts',
          'src/plugin/esbuild.ts',
          'src/plugin/nextjs.ts',
          'src/plugin/nextjs-edge.ts',
          'src/plugin/nextjs-widget.ts',
        ],
        external: [/^@conciv\//],
      },
    },
  }),
)
