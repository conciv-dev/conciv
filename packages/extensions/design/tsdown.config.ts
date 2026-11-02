import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/server.ts',
    'src/shared/defs.ts',
    'src/server/provenance.ts',
    'src/server/differ.ts',
    'src/server/target.ts',
    'src/server/deltas.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
