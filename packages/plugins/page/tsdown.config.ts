import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/rpc.ts', 'src/testing.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
