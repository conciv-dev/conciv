import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/design.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
