import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/testkit.ts', 'src/until.ts', 'src/login.ts', 'src/rpc-mounts.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
