import {defineConfig} from 'tsdown'

// One factory (index.ts) + a subpath entry per bundler, plus the Next.js entries (nextjs =
// withAidx/register, nextjs-widget = client mount). @opendui/aidx-* + unplugin + vite + launch-editor
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
  external: [/^@opendui\/aidx-/, 'unplugin', 'vite', 'launch-editor'],
})
