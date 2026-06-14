import {defineConfig} from 'tsdown'

// One factory (index.ts) + a subpath entry per bundler. @aidx/* + unplugin + vite +
// launch-editor stay external (peer/host deps, never bundled).
export default defineConfig({
  entry: ['src/index.ts', 'src/vite.ts', 'src/webpack.ts', 'src/rspack.ts', 'src/rollup.ts', 'src/esbuild.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^@aidx\//, 'unplugin', 'vite', 'launch-editor'],
})
