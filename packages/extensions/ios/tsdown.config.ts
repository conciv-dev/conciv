import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts', 'src/shared/bridge.ts', 'src/shared/bridge-client.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
