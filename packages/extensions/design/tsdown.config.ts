import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/server.ts',
    'src/shared/defs.ts',
    'src/server/provenance/mappers.ts',
    'src/server/text-groups.ts',
    'src/server/comparators/paddle.ts',
    'src/server/deltas/colors.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
