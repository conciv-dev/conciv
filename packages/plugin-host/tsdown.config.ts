import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {index: 'src/index.ts', 'photon-worker': 'src/core/image/photon-worker.ts'},
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
