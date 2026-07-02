import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/vite.ts',
    'src/webpack.ts',
    'src/rspack.ts',
    'src/rollup.ts',
    'src/esbuild.ts',
    'src/nextjs.ts',
    'src/nextjs-widget.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^@conciv\/conciv-/, 'unplugin', 'vite', 'launch-editor'],
})
