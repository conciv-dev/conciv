import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/plugin/vite.ts',
    'src/plugin/webpack.ts',
    'src/plugin/rspack.ts',
    'src/plugin/rollup.ts',
    'src/plugin/esbuild.ts',
    'src/plugin/nextjs.ts',
    'src/plugin/nextjs-widget.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^@conciv\//, 'unplugin', 'vite', 'launch-editor', 'next'],
})
