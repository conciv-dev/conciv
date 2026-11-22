import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: [
    'src/index.ts',
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
  format: 'esm',
  fixedExtension: false,
  dts: false,
  external: ['unplugin', 'vite', 'launch-editor'],
})
