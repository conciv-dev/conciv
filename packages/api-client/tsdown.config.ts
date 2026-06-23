import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/api-client.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
