import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/*.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: {resolver: 'tsc'},
})
