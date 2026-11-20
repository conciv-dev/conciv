import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/testkit.ts', 'src/until.ts', 'src/rpc-mounts.ts', 'src/node.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
