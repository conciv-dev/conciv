import {defineConfig} from 'tsdown'

// Single entry → dist/index.js + .d.ts. solid-js (peer) + @mandarax/ui-kit-system stay external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
