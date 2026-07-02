import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/bin.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
