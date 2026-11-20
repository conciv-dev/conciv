import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/harness-engine.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
