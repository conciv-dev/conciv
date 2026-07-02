import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/tools.ts', 'src/defs.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
