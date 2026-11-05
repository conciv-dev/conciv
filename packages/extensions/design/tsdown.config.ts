import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/server.ts',
    'src/shared/defs.ts',
    'src/server/provenance.ts',
    'src/server/differ.ts',
    'src/server/target.ts',
    'src/server/raster.ts',
    'src/server/store.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
