import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/browser-fixture.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
