import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/serve.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
