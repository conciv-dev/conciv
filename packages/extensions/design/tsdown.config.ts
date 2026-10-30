import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts', 'src/shared/defs.ts', 'src/server/provenance/mappers.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
