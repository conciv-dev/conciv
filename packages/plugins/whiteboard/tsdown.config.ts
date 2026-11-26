import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/whiteboard.ts', 'src/rpc.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
