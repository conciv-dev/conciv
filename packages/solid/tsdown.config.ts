import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/solid.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  external: [/^@conciv\//, 'solid-js', 'solid-js/web'],
})
