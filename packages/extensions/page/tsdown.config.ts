import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/client.ts', 'src/server.ts', 'src/shared/defs.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
