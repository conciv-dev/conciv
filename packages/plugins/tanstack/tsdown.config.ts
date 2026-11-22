import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/index.ts', 'src/rpc.ts', 'src/client.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
