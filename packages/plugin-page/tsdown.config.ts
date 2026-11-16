import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/rpc.ts', 'src/cli.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
