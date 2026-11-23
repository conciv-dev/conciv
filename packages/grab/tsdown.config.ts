import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/grab.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
