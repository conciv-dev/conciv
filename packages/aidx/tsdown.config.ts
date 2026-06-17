import {defineConfig} from 'tsdown'

// Umbrella package: thin re-exports of @opendui/aidx-plugin. The plugin (and its host deps)
// stay external — never bundled — so @opendui/aidx just forwards types and runtime to it.
export default defineConfig({
  entry: [
    'src/plugin/index.ts',
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
  external: [/^@opendui\/aidx-/, 'unplugin', 'vite', 'launch-editor', 'next'],
})
