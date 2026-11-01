import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts', 'src/devframe.ts', 'src/dock.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
