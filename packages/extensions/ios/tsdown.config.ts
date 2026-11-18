import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {'shared/bridge': 'src/shared/bridge.ts', 'shared/bridge-client': 'src/shared/bridge-client.ts'},
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
