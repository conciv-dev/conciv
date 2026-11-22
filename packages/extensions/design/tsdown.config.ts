import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/index.ts', 'src/server.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
