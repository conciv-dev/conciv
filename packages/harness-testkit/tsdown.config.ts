import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/harness-engine.ts', 'src/run-tests.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
