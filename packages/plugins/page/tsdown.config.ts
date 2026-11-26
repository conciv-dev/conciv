import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/page.ts', 'src/rpc.ts', 'src/engine-builtins.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
