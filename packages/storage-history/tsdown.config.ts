import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/storage-history.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
