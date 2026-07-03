import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/rig.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
