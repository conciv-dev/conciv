import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
