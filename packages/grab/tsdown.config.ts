import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/grab.ts', 'src/grab-attachment.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
