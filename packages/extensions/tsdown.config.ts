import {defineConfig} from 'tsdown'

// Single entry → dist/index.js + .d.ts. solid-js (peer) + @mandarax/ui-kit-system stay external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  external: ['@tanstack/db', '@tanstack/solid-db', '@tanstack/trailbase-db-collection'],
  dts: true,
})
