import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/rpc-entry.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
