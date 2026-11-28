import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/plugin/vite.ts',
    'src/plugin/webpack.ts',
    'src/plugin/rspack.ts',
    'src/plugin/rollup.ts',
    'src/plugin/esbuild.ts',
    'src/plugin/nextjs.ts',
    'src/plugin/nextjs-edge.ts',
    'src/plugin/nextjs-widget.ts',
  ],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  unbundle: true,
  fixedExtension: false,
})
