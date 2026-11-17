import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/serve.ts', 'src/rpc.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
