import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/plugin.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
