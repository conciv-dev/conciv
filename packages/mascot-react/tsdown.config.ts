import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  unbundle: true,
  dts: false,
  external: ['react', /^react\//, /^@conciv\/mascot/],
})
