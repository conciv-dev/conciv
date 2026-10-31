import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts', 'src/shared/defs.ts', 'src/client/body-margins.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
