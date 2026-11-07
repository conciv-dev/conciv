import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/read-only-query.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
