import {defineConfig} from 'tsdown'

// One factory (index.ts) + a subpath entry per bundler, plus the Next.js entries (nextjs =
// withMandarax/register, nextjs-widget = client mount). @mandarax/* + unplugin + vite + launch-editor
// stay external (peer/host deps, never bundled).
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
  external: [/^@mandarax\/mandarax-/, 'unplugin', 'vite', 'launch-editor'],
})
