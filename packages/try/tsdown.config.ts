import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/bin.ts', 'src/connect.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
