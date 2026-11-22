import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/grab.ts', 'src/grab-attachment.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
