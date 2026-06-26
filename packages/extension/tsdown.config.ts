import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime.ts', 'src/catalog.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
