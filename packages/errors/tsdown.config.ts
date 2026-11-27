import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/errors.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
