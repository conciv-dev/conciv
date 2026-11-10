import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts', 'src/shared/defs.ts', 'src/shared/design-tools.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
