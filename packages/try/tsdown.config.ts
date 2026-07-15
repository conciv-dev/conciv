import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/bin.ts', 'src/connect.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
