import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/tools.ts', 'src/defs.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
