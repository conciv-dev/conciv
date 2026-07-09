import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server/index.ts', 'src/solid/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
