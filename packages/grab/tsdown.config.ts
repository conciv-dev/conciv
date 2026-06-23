import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/grab.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
